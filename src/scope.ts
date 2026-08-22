import { cp, mkdir, rename, rm, stat } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { findProjectRoot, pathExists, type SkillEntry } from './skill-files.js'

export function workspaceSkillRoot(projectRoot: string): string {
  return join(projectRoot, '.dsh', 'skills')
}

export function scopeRootOf(target: string | null | undefined, dshHome: string): string {
  return target === null || target === undefined ? join(dshHome, 'skills') : workspaceSkillRoot(target)
}

export async function normalizeWorkspaces(paths: (string | undefined | null)[]): Promise<string[]> {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of paths) {
    if (typeof raw !== 'string' || raw.trim() === '') continue
    const absolute = resolve(raw.trim())
    const info = await stat(absolute).catch(() => undefined as import('node:fs').Stats | undefined)
    if (info === undefined || !info.isDirectory()) throw new Error('工作区不存在或不是目录："' + raw + '"')
    const project = await findProjectRoot(absolute)
    const key = process.platform === 'win32' ? project.toLowerCase() : project
    if (seen.has(key)) continue
    seen.add(key)
    result.push(project)
  }
  return result
}

export async function normalizeWorkspace(raw: string | undefined | null): Promise<string> {
  const list = await normalizeWorkspaces([raw])
  if (list.length === 0) throw new Error('至少需要指定一个存在的工作区')
  return list[0]
}

function isBusyError(error: unknown): boolean {
  return error !== null && typeof error === 'object' && ['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY'].includes((error as { code?: string }).code ?? '')
}

async function removeRetry(path: string): Promise<boolean> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await rm(path, { recursive: true, force: true })
      return true
    } catch (error) {
      if (!isBusyError(error)) throw error
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 300 * (attempt + 1)))
    }
  }
  return false
}

export interface MigrateResult {
  target: string
}

export async function migrateEntry(entry: SkillEntry, targetRoot: string, mode: 'copy' | 'move'): Promise<MigrateResult> {
  const sourceDir = entry.dirBundle ? dirname(entry.file) : entry.file
  const target = entry.dirBundle ? join(targetRoot, entry.name) : join(targetRoot, basename(entry.file))

  if (resolve(sourceDir) === resolve(target)) throw new Error('技能 "' + entry.name + '" 已在此作用域中')
  if (await pathExists(target)) throw new Error('目标位置已存在同名技能："' + target + '"')
  if (!(await pathExists(sourceDir))) throw new Error('技能 "' + entry.name + '" 的源文件不存在：' + sourceDir)

  await mkdir(targetRoot, { recursive: true })

  if (mode === 'move') {
    try {
      await rename(sourceDir, target)
      return { target }
    } catch (error) {
      const code = (error as { code?: string }).code
      if (!['EXDEV', 'EBUSY', 'EPERM', 'EACCES'].includes(code)) throw new Error('移动技能文件失败：' + (error instanceof Error ? error.message : String(error)))
    }
  }

  const staging = join(targetRoot, '.dsh-skill-staging-' + process.pid + '-' + Math.random().toString(36).slice(2, 8))
  try {
    if (entry.dirBundle) {
      await cp(sourceDir, staging, { recursive: true })
      await rename(staging, target)
    } else {
      await mkdir(staging, { recursive: true })
      const stagedFile = join(staging, basename(entry.file))
      await cp(entry.file, stagedFile)
      await rename(stagedFile, target)
      await rm(staging, { recursive: true, force: true }).catch(() => {})
    }
  } catch (error) {
    await rm(staging, { recursive: true, force: true }).catch(() => {})
    throw new Error('复制技能文件失败（已回滚）：' + (error instanceof Error ? error.message : String(error)))
  }

  if (mode === 'move') {
    try {
      if (!(await removeRetry(sourceDir))) throw new Error('源文件删除超时')
    } catch (error) {
      await rm(target, { recursive: true, force: true }).catch(() => {})
      throw new Error('技能 "' + entry.name + '" 已复制到目标，但无法删除源文件（可能被占用），已回滚新副本：' + (error instanceof Error ? error.message : String(error)))
    }
  }
  return { target }
}

export interface BatchMigrateItemResult {
  name: string
  ok: boolean
  error?: string
}

export async function batchMigrateEntries(items: SkillEntry[], targetRoot: string, mode: 'copy' | 'move'): Promise<BatchMigrateItemResult[]> {
  const results: BatchMigrateItemResult[] = []
  for (const item of items) {
    try {
      await migrateEntry(item, targetRoot, mode)
      results.push({ name: item.name, ok: true })
    } catch (error) {
      results.push({ name: item.name, ok: false, error: error instanceof Error ? error.message : String(error) })
    }
  }
  return results
}