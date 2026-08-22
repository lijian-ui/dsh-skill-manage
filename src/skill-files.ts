import { access, readdir, readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { parse as parseYaml } from 'yaml'

export const DISABLED_SUFFIX = '.disabled'

export const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export interface SkillEntry {
  name: string
  description: string
  whenToUse?: string
  enabled: boolean
  kind: 'bundle' | 'flat'
  file: string
  dirBundle: boolean
  source: string
  projectRoot?: string
}

export interface SkillRoot {
  path: string
  source: string
  projectRoot?: string
}

export interface ParsedFrontmatter {
  name: string
  description: string
  whenToUse?: string
  body: string
}

export interface ValidationOk {
  ok: true
  skill: { name: string; description: string; whenToUse?: string; body: string }
}

export interface ValidationFail {
  ok: false
  error: string
}

export type ValidationResult = ValidationOk | ValidationFail

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function findProjectRoot(cwd: string): Promise<string> {
  let current = resolve(cwd)
  while (true) {
    if (await pathExists(join(current, '.git'))) return current
    const parent = dirname(current)
    if (parent === current) return resolve(cwd)
    current = parent
  }
}

export function parseFrontmatter(raw: string): ParsedFrontmatter | undefined {
  const text = raw.trimStart()
  if (!text.startsWith('---')) return undefined
  const firstEnd = text.indexOf('\n')
  if (firstEnd === -1) return undefined
  const closing = text.indexOf('\n---', firstEnd + 1)
  const fmEnd = closing === -1 ? text.length : closing
  const fm = text.slice(3, fmEnd)
  let body = ''
  if (closing !== -1) {
    const at = text.indexOf('\n', closing + 3)
    if (at !== -1) body = text.slice(at + 1)
  }
  const pick = (key: string): string | undefined => {
    const m = new RegExp('^' + key + ':\\s*(.+)$', 'm').exec(fm)
    if (m === null) return undefined
    const value = m[1].trim()
    return value.replace(/^["']|["']$/g, '')
  }
  const name = pick('name')
  if (name === undefined || !SKILL_NAME_RE.test(name)) return undefined
  return { name, description: pick('description') ?? '', whenToUse: pick('whenToUse'), body: body.trim() }
}

export function validateFrontmatter(raw: string): ValidationResult {
  const text = raw.trimStart()
  if (!text.startsWith('---')) return { ok: false, error: '缺少 YAML frontmatter（文件必须以 --- 开头）' }
  const firstEnd = text.indexOf('\n')
  if (firstEnd === -1) return { ok: false, error: 'frontmatter 未闭合' }
  const closing = text.indexOf('\n---', firstEnd + 1)
  if (closing === -1) return { ok: false, error: 'frontmatter 未闭合（缺少结尾的 ---）' }
  const fm = text.slice(firstEnd + 1, closing)
  let data: unknown
  try {
    data = parseYaml(fm)
  } catch (error) {
    return { ok: false, error: 'frontmatter 不是合法的 YAML：' + (error instanceof Error ? error.message : String(error)) }
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return { ok: false, error: 'frontmatter 必须是键值对（YAML 映射）' }
  const obj = data as Record<string, unknown>
  for (const key of ['disableModelInvocation', 'modelInvocable', 'userInvocable']) {
    if (key in obj) return { ok: false, error: '不支持旧字段 "' + key + '"，请改用 disable-model-invocation / user-invocable' }
  }
  const name = obj.name
  if (typeof name !== 'string' || name.length === 0) return { ok: false, error: 'frontmatter 缺少 name（必须是非空字符串）' }
  if (!SKILL_NAME_RE.test(name)) return { ok: false, error: '技能名 "' + name + '" 不符合命名规则（仅小写字母、数字与连字符，如 my-skill）' }
  const description = obj.description
  if (typeof description !== 'string' || description.trim().length === 0) return { ok: false, error: 'frontmatter 缺少 description（必须是非空字符串）' }
  const whenToUse = obj.whenToUse
  if (whenToUse !== undefined && typeof whenToUse !== 'string') return { ok: false, error: 'whenToUse 必须是字符串' }
  for (const key of ['disable-model-invocation', 'user-invocable']) {
    const value = obj[key]
    if (value !== undefined) {
      const lower = String(value).toLowerCase()
      if (!['true', 'false', 'yes', 'no', 'on', 'off', '1', '0'].includes(lower)) return { ok: false, error: key + ' 必须是布尔值' }
    }
  }
  if (obj.metadata !== undefined && (typeof obj.metadata !== 'object' || obj.metadata === null || Array.isArray(obj.metadata))) return { ok: false, error: 'metadata 必须是对象' }
  return { ok: true, skill: { name, description, whenToUse: typeof whenToUse === 'string' ? whenToUse : undefined, body: '' } }
}

export async function buildRoots(cwd: string | undefined, options: { dshHome?: string; agentsHome?: string } = {}): Promise<SkillRoot[]> {
  const roots: SkillRoot[] = []
  const seen = new Set<string>()
  const push = (path: string, source: string, projectRoot?: string): void => {
    const normalized = resolve(path)
    const key = process.platform === 'win32' ? normalized.toLowerCase() : normalized
    if (seen.has(key)) return
    seen.add(key)
    roots.push({ path, source, projectRoot })
  }
  if (cwd !== undefined) {
    const project = await findProjectRoot(cwd)
    push(join(project, '.dsh', 'skills'), 'project-dsh', project)
    push(join(project, '.agents', 'skills'), 'project-agents', project)
  }
  if (options.dshHome !== undefined) push(join(options.dshHome, 'skills'), 'user-dsh', undefined)
  if (options.agentsHome !== undefined) push(join(options.agentsHome, 'skills'), 'user-agents', undefined)
  return roots
}

export async function collectSkillEntries(roots: SkillRoot[]): Promise<SkillEntry[]> {
  const entries: SkillEntry[] = []
  for (const root of roots) {
    let items: import('node:fs').Dirent[]
    try {
      items = await readdir(root.path, { withFileTypes: true })
    } catch {
      continue
    }
    for (const item of items) {
      const isDir = item.isDirectory() || (item.isSymbolicLink() && (await stat(join(root.path, item.name)).catch(() => undefined as import('node:fs').Stats | undefined))?.isDirectory() === true)
      if (isDir) {
        const md = join(root.path, item.name, 'SKILL.md')
        const disabled = md + DISABLED_SUFFIX
        if (await pathExists(md)) {
          const parsed = parseFrontmatter(await readFile(md, 'utf8').catch(() => ''))
          entries.push({ name: parsed?.name ?? item.name, description: parsed?.description ?? '', whenToUse: parsed?.whenToUse, enabled: true, kind: 'bundle', file: md, dirBundle: true, source: root.source, projectRoot: root.projectRoot })
        } else if (await pathExists(disabled)) {
          const parsed = parseFrontmatter(await readFile(disabled, 'utf8').catch(() => ''))
          entries.push({ name: parsed?.name ?? item.name, description: parsed?.description ?? '', whenToUse: parsed?.whenToUse, enabled: false, kind: 'bundle', file: disabled, dirBundle: true, source: root.source, projectRoot: root.projectRoot })
        }
      } else if (item.isFile()) {
        if (item.name.endsWith('.md' + DISABLED_SUFFIX)) {
          const file = join(root.path, item.name)
          const parsed = parseFrontmatter(await readFile(file, 'utf8').catch(() => ''))
          entries.push({ name: parsed?.name ?? item.name.slice(0, -('.md' + DISABLED_SUFFIX).length), description: parsed?.description ?? '', whenToUse: parsed?.whenToUse, enabled: false, kind: 'flat', file, dirBundle: false, source: root.source, projectRoot: root.projectRoot })
        } else if (item.name.endsWith('.md')) {
          const file = join(root.path, item.name)
          const parsed = parseFrontmatter(await readFile(file, 'utf8'))
          entries.push({ name: parsed?.name ?? item.name.slice(0, -3), description: parsed?.description ?? '', whenToUse: parsed?.whenToUse, enabled: true, kind: 'flat', file, dirBundle: false, source: root.source, projectRoot: root.projectRoot })
        }
      }
    }
  }
  return entries
}

export function winnerEntry(entries: SkillEntry[], name: string): SkillEntry | undefined {
  const matches = entries.filter((entry) => entry.name === name)
  if (matches.length === 0) return undefined
  matches.sort((a, b) => sourceRank(a.source) - sourceRank(b.source))
  return matches[0]
}

export function sourceRank(source: string): number {
  switch (source) {
    case 'project-dsh': return 1
    case 'project-agents': return 2
    case 'user-dsh': return 3
    case 'user-agents': return 4
    default: return 9
  }
}