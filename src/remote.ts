import { Context } from '@deepseek-ai/cordis'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { z } from 'zod'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve as resolvePath } from 'node:path'
import { homedir } from 'node:os'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import {
  DISABLED_SUFFIX,
  collectSkillEntries,
  findProjectRoot,
  pathExists,
  validateFrontmatter,
  winnerEntry,
  type SkillEntry,
  type SkillRoot,
} from './skill-files.js'
import {
  batchMigrateEntries,
  migrateEntry,
  normalizeWorkspace,
  scopeRootOf,
  workspaceSkillRoot,
} from './scope.js'

const SERVICE = 'skillManage'
const PACKAGE = '@lijian-ui/dsh-skill-manage'

const sessionIdSchema = z.string().optional()

const scopeSchema = z.object({
  kind: z.enum(['global', 'workspace']),
  path: z.string().optional(),
  label: z.string().optional(),
})

const skillSummarySchema = z.object({
  name: z.string(),
  description: z.string(),
  whenToUse: z.string().optional(),
  provider: z.string(),
  source: z.string(),
  enabled: z.boolean(),
  modelInvocable: z.boolean(),
  userInvocable: z.boolean(),
  scope: scopeSchema.optional(),
})

const listResultSchema = z.object({ skills: z.array(skillSummarySchema) })

const workspacesResultSchema = z.object({
  workspaces: z.array(z.object({ path: z.string(), label: z.string(), sessions: z.number() })),
})

const resourceBaseSchema = z
  .object({
    kind: z.string(),
    path: z.string().optional(),
    url: z.string().optional(),
    description: z.string().optional(),
  })
  .optional()

const skillContentSchema = z
  .object({
    name: z.string(),
    description: z.string(),
    content: z.string(),
    provider: z.string(),
    whenToUse: z.string().optional(),
    path: z.string().optional(),
    resourceBase: resourceBaseSchema,
  })
  .nullable()

const setEnabledResultSchema = z.object({ name: z.string(), enabled: z.boolean() })

const deleteSkillResultSchema = z.object({ name: z.string() })

const migratePayloadSchema = z.object({
  target: z.string().nullable(),
  mode: z.enum(['copy', 'move']),
})
const migrateResultSchema = z.object({ name: z.string(), scope: scopeSchema })

const batchMigratePayloadSchema = z.object({
  from: z.string().nullable(),
  targets: z.array(z.string().nullable()).min(1),
  mode: z.enum(['copy', 'move']),
  names: z.array(z.string()),
})
const batchMigrateResultSchema = z.object({
  results: z.array(z.object({ name: z.string(), target: z.string().nullable().optional(), ok: z.boolean(), error: z.string().optional() })),
})

const addFileSchema = z.object({ path: z.string(), base64: z.string() })
const addPayloadSchema = z.object({
  kind: z.enum(['bundle', 'flat']),
  files: z.array(addFileSchema).min(1),
  workspace: z.string().nullable().optional(),
})
const addResultSchema = z.object({ name: z.string(), kind: z.enum(['bundle', 'flat']), scope: scopeSchema })

const MANIFEST = {
  package: PACKAGE,
  face: 'host' as const,
  schemas: [],
  invocations: [
    {
      id: `${PACKAGE}#${SERVICE}/list`,
      service: SERVICE,
      namespace: SERVICE,
      method: 'list',
      invocation: { kind: 'direct' },
      parameters: [
        { name: 'sessionId', wire: 'sessionId', source: 'json', acceptsUndefined: true, codec: { mode: 'strict' as const, typeSymbol: `${PACKAGE}#sessionId`, schema: sessionIdSchema } },
      ],
      result: { mode: 'strict' as const, typeSymbol: `${PACKAGE}#SkillListResult`, schema: listResultSchema },
    },
    {
      id: `${PACKAGE}#${SERVICE}/workspaces`,
      service: SERVICE,
      namespace: SERVICE,
      method: 'workspaces',
      invocation: { kind: 'direct' },
      parameters: [],
      result: { mode: 'strict' as const, typeSymbol: `${PACKAGE}#WorkspacesResult`, schema: workspacesResultSchema },
    },
    {
      id: `${PACKAGE}#${SERVICE}/content`,
      service: SERVICE,
      namespace: SERVICE,
      method: 'content',
      invocation: { kind: 'direct' },
      parameters: [
        { name: 'name', wire: 'name', source: 'json', codec: { mode: 'strict' as const, typeSymbol: `${PACKAGE}#SkillName`, schema: z.string() } },
        { name: 'sessionId', wire: 'sessionId', source: 'json', acceptsUndefined: true, codec: { mode: 'strict' as const, typeSymbol: `${PACKAGE}#sessionId`, schema: sessionIdSchema } },
      ],
      result: { mode: 'strict' as const, typeSymbol: `${PACKAGE}#SkillContent`, schema: skillContentSchema },
    },
    {
      id: `${PACKAGE}#${SERVICE}/setEnabled`,
      service: SERVICE,
      namespace: SERVICE,
      method: 'setEnabled',
      invocation: { kind: 'direct' },
      parameters: [
        { name: 'name', wire: 'name', source: 'json', codec: { mode: 'strict' as const, typeSymbol: `${PACKAGE}#SkillName`, schema: z.string() } },
        { name: 'sessionId', wire: 'sessionId', source: 'json', acceptsUndefined: true, codec: { mode: 'strict' as const, typeSymbol: `${PACKAGE}#sessionId`, schema: sessionIdSchema } },
        { name: 'enabled', wire: 'enabled', source: 'json', codec: { mode: 'strict' as const, typeSymbol: `${PACKAGE}#EnabledFlag`, schema: z.boolean() } },
      ],
      result: { mode: 'strict' as const, typeSymbol: `${PACKAGE}#SetEnabledResult`, schema: setEnabledResultSchema },
    },
    {
      id: `${PACKAGE}#${SERVICE}/migrate`,
      service: SERVICE,
      namespace: SERVICE,
      method: 'migrate',
      invocation: { kind: 'direct' },
      parameters: [
        { name: 'name', wire: 'name', source: 'json', codec: { mode: 'strict' as const, typeSymbol: `${PACKAGE}#SkillName`, schema: z.string() } },
        { name: 'sessionId', wire: 'sessionId', source: 'json', acceptsUndefined: true, codec: { mode: 'strict' as const, typeSymbol: `${PACKAGE}#sessionId`, schema: sessionIdSchema } },
        { name: 'payload', wire: 'payload', source: 'json', codec: { mode: 'strict' as const, typeSymbol: `${PACKAGE}#MigratePayload`, schema: migratePayloadSchema } },
      ],
      result: { mode: 'strict' as const, typeSymbol: `${PACKAGE}#MigrateResult`, schema: migrateResultSchema },
    },
    {
      id: `${PACKAGE}#${SERVICE}/batchMigrate`,
      service: SERVICE,
      namespace: SERVICE,
      method: 'batchMigrate',
      invocation: { kind: 'direct' },
      parameters: [
        { name: 'sessionId', wire: 'sessionId', source: 'json', acceptsUndefined: true, codec: { mode: 'strict' as const, typeSymbol: `${PACKAGE}#sessionId`, schema: sessionIdSchema } },
        { name: 'payload', wire: 'payload', source: 'json', codec: { mode: 'strict' as const, typeSymbol: `${PACKAGE}#BatchMigratePayload`, schema: batchMigratePayloadSchema } },
      ],
      result: { mode: 'strict' as const, typeSymbol: `${PACKAGE}#BatchMigrateResult`, schema: batchMigrateResultSchema },
    },
    {
      id: `${PACKAGE}#${SERVICE}/deleteSkill`,
      service: SERVICE,
      namespace: SERVICE,
      method: 'deleteSkill',
      invocation: { kind: 'direct' },
      parameters: [
        { name: 'name', wire: 'name', source: 'json', codec: { mode: 'strict' as const, typeSymbol: `${PACKAGE}#SkillName`, schema: z.string() } },
        { name: 'sessionId', wire: 'sessionId', source: 'json', acceptsUndefined: true, codec: { mode: 'strict' as const, typeSymbol: `${PACKAGE}#sessionId`, schema: sessionIdSchema } },
      ],
      result: { mode: 'strict' as const, typeSymbol: `${PACKAGE}#DeleteSkillResult`, schema: deleteSkillResultSchema },
    },
    {
      id: `${PACKAGE}#${SERVICE}/addSkill`,
      service: SERVICE,
      namespace: SERVICE,
      method: 'addSkill',
      invocation: { kind: 'direct' },
      parameters: [
        { name: 'sessionId', wire: 'sessionId', source: 'json', acceptsUndefined: true, codec: { mode: 'strict' as const, typeSymbol: `${PACKAGE}#sessionId`, schema: sessionIdSchema } },
        { name: 'payload', wire: 'payload', source: 'json', codec: { mode: 'strict' as const, typeSymbol: `${PACKAGE}#AddPayload`, schema: addPayloadSchema } },
      ],
      result: { mode: 'strict' as const, typeSymbol: `${PACKAGE}#AddResult`, schema: addResultSchema },
    },
  ],
  model: { services: [], events: [], objects: [] },
}

const MAX_ADD_FILES = 200
const MAX_ADD_TOTAL_BYTES = 8 * 1024 * 1024

interface ScopeInfo {
  kind: 'global' | 'workspace'
  path?: string
  label?: string
}

interface SkillSummary {
  name: string
  description: string
  whenToUse?: string
  provider: string
  source: string
  enabled: boolean
  modelInvocable: boolean
  userInvocable: boolean
  scope?: ScopeInfo
}

interface WorkspaceInfo {
  path: string
  label: string
  sessions: number
}

interface SkillContent {
  name: string
  description: string
  content: string
  provider: string
  whenToUse?: string
  path?: string
  resourceBase?: { kind: string; path?: string; url?: string; description?: string }
}

interface RegistrySkill {
  name: string
  description: string
  content: string
  provider: string
  whenToUse?: string
  path?: string
  source?: string
  resourceBase?: { kind: string; path?: string; url?: string; description?: string }
  invocation: { modelInvocable: boolean; userInvocable: boolean }
}

interface Registry {
  list(opts: { cwd?: string; scope?: unknown }): Promise<RegistrySkill[]>
  get(name: string, opts: { cwd?: string; scope?: unknown }): Promise<RegistrySkill | undefined>
}

type LocateResult =
  | { kind: 'live'; skill: RegistrySkill }
  | { kind: 'file'; entry: SkillEntry }
  | { kind: 'missing' }

class SkillManageApi extends TypertRemoteService {
  constructor(ctx: Context) {
    super(ctx, SERVICE)
  }

  registryFor(sessionId: string | undefined): Registry {
    const live = sessionId === undefined ? undefined : (this.ctx as Context & { agents: { get(id: string): unknown } }).agents.get(sessionId)
    if (live !== undefined) {
      const scoped = (this.ctx as Context & { get(key: string): unknown }).get('agentPresets') as { serviceFor?(agent: unknown, key: string): Registry } | undefined
      const result = scoped?.serviceFor?.(live, 'skills')
      if (result !== undefined) return result
    }
    return (this.ctx as Context & { skills: Registry }).skills
  }

  viewFor(sessionId: string | undefined): { registry: Registry; cwd?: string; scope: unknown } {
    const registry = this.registryFor(sessionId)
    const session = sessionId === undefined ? undefined : (this.ctx as Context & { sessions: { get(id: string): { header?: { cwd?: string } } } }).sessions.get(sessionId)
    const scope = sessionId === undefined ? undefined : (this.ctx as Context & { agents: { get(id: string): unknown } }).agents.get(sessionId)
    return { registry, cwd: session?.header?.cwd, scope }
  }

  homes(): { dshHome: string; agentsHome: string } {
    return {
      dshHome: resolveDshHome(),
      agentsHome: resolvePath(process.env.DSH_AGENTS_HOME?.trim() ? process.env.DSH_AGENTS_HOME : join(homedir(), '.agents')),
    }
  }

  isWithin(baseDir: string, candidate: string): boolean {
    if (typeof candidate !== 'string' || candidate === '') return false
    const base = resolvePath(baseDir)
    const value = resolvePath(candidate)
    if (value === base) return true
    const b = process.platform === 'win32' ? base.toLowerCase() : base
    const v = process.platform === 'win32' ? value.toLowerCase() : value
    const sep = process.platform === 'win32' ? '\\' : '/'
    return v.startsWith(b.endsWith(sep) ? b : b + sep)
  }

  async allRoots(): Promise<SkillRoot[]> {
    const { dshHome, agentsHome } = this.homes()
    const roots: SkillRoot[] = []
    const seen = new Set<string>()
    const push = (path: string, source: string, projectRoot?: string): void => {
      const normalized = resolvePath(path)
      const key = process.platform === 'win32' ? normalized.toLowerCase() : normalized
      if (seen.has(key)) return
      seen.add(key)
      roots.push({ path, source, projectRoot })
    }
    push(join(dshHome, 'skills'), 'user-dsh', undefined)
    push(join(agentsHome, 'skills'), 'user-agents', undefined)
    for (const workspace of (await this.workspaces()).workspaces) {
      push(join(workspace.path, '.dsh', 'skills'), 'project-dsh', workspace.path)
      push(join(workspace.path, '.agents', 'skills'), 'project-agents', workspace.path)
    }
    return roots
  }

  async fileEntriesAll(): Promise<SkillEntry[]> {
    return collectSkillEntries(await this.allRoots())
  }

  workspaceOfPath(path: string | undefined, roots: SkillRoot[]): string | undefined {
    if (typeof path !== 'string' || path === '') return undefined
    for (const root of roots) {
      if (root.projectRoot === undefined) continue
      if (this.isWithin(root.path, path)) return root.projectRoot
    }
    return undefined
  }

  scopeForEntry(entry: SkillEntry): ScopeInfo {
    if (entry.projectRoot !== undefined) return { kind: 'workspace', path: entry.projectRoot, label: basename(entry.projectRoot) || entry.projectRoot }
    return { kind: 'global' }
  }

  scopeForTarget(targetRoot: string, targetProject: string | null | undefined): ScopeInfo {
    const { dshHome } = this.homes()
    if (resolvePath(targetRoot) === resolvePath(join(dshHome, 'skills'))) return { kind: 'global' }
    return { kind: 'workspace', path: targetProject ?? undefined, label: targetProject !== undefined && targetProject !== null ? (basename(targetProject) || targetProject) : undefined }
  }

  async list(sessionId: string | undefined): Promise<{ skills: SkillSummary[] }> {
    const { registry, cwd, scope } = this.viewFor(sessionId)
    const roots = await this.allRoots()
    const listed = await registry.list({ cwd, scope })
    const skills: SkillSummary[] = []
    const seen = new Set<string>()
    const seenKey = (name: string, scopePath: string | undefined): string => name + '\u0000' + (scopePath ?? 'global')
    for (const skill of listed) {
      if (this.workspaceOfPath(skill.path, roots) !== undefined) continue
      const source = skill.source ?? (skill.provider === 'runtime' ? 'runtime' : '')
      skills.push({
        name: skill.name,
        description: skill.description,
        ...(skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse }),
        provider: skill.provider,
        source,
        enabled: true,
        modelInvocable: skill.invocation.modelInvocable,
        userInvocable: skill.invocation.userInvocable,
        scope: { kind: 'global' },
      })
      seen.add(seenKey(skill.name, 'global'))
    }
    for (const entry of await collectSkillEntries(roots)) {
      const scopePath = entry.projectRoot ?? 'global'
      if (seen.has(seenKey(entry.name, scopePath))) continue
      seen.add(seenKey(entry.name, scopePath))
      skills.push({
        name: entry.name,
        description: entry.description,
        ...(entry.whenToUse === undefined ? {} : { whenToUse: entry.whenToUse }),
        provider: 'filesystem',
        source: entry.source,
        enabled: entry.enabled,
        modelInvocable: false,
        userInvocable: false,
        scope: this.scopeForEntry(entry),
      })
    }
    return { skills }
  }

  async workspaces(): Promise<{ workspaces: WorkspaceInfo[] }> {
    const map = new Map<string, WorkspaceInfo>()
    const keyOf = (path: string): string => (process.platform === 'win32' ? path.toLowerCase() : path)
    const add = async (path: string, label: string | undefined, sessions: number | undefined): Promise<void> => {
      if (typeof path !== 'string' || path === '') return
      let project: string
      try {
        project = await findProjectRoot(resolvePath(path))
      } catch {
        return
      }
      const key = keyOf(project)
      if (map.has(key)) return
      map.set(key, { path: project, label: label || basename(project) || project, sessions: sessions ?? 0 })
    }
    try {
      const registry = (this.ctx as Context & { get(key: string): unknown }).get('workspaceRegistry') as { list?(): Array<{ path: string; title?: string; sessionIds?: string[]; status?(): Promise<string> }> } | undefined
      if (registry !== undefined && typeof registry.list === 'function') {
        for (const workspace of registry.list()) {
          try {
            if ((await workspace.status()) !== 'ok') continue
          } catch {
          }
          await add(workspace.path, workspace.title, Array.isArray(workspace.sessionIds) ? workspace.sessionIds.length : 0)
        }
      }
    } catch {
    }
    try {
      for (const session of (this.ctx as Context & { sessions: { list(): Array<{ header?: { cwd?: string } }> } }).sessions.list()) {
        const cwd = session.header?.cwd
        if (cwd === undefined || cwd === '') continue
        await add(resolvePath(cwd), undefined, 1)
      }
    } catch {
    }
    return { workspaces: [...map.values()].sort((a, b) => a.label.localeCompare(b.label) || a.path.localeCompare(b.path)) }
  }

  async locate(name: string, sessionId: string | undefined): Promise<LocateResult> {
    const { registry, cwd, scope } = this.viewFor(sessionId)
    const skill = await registry.get(name, { cwd, scope })
    if (skill !== undefined && this.workspaceOfPath(skill.path, await this.allRoots()) === undefined) return { kind: 'live', skill }
    const entry = winnerEntry(await this.fileEntriesAll(), name)
    if (entry !== undefined) return { kind: 'file', entry }
    return { kind: 'missing' }
  }

  async content(name: string, sessionId: string | undefined): Promise<SkillContent | null> {
    const located = await this.locate(name, sessionId)
    if (located.kind === 'missing') return null
    if (located.kind === 'file') {
      const raw = await readFile(located.entry.file, 'utf8')
      return {
        name: located.entry.name,
        description: located.entry.description,
        content: raw,
        provider: 'filesystem',
        path: located.entry.file,
      }
    }
    const skill = located.skill
    return {
      name: skill.name,
      description: skill.description,
      content: skill.content,
      provider: skill.provider,
      ...(skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse }),
      ...(skill.path === undefined ? {} : { path: skill.path }),
      ...(skill.resourceBase === undefined ? {} : { resourceBase: skill.resourceBase }),
    }
  }


  assertEditable(skill: RegistrySkill): void {
    if (skill.source === 'bundled') throw new Error('技能 "' + skill.name + '" 随部署附带，不可修改')
    if (typeof skill.path !== 'string' || skill.path.length === 0) throw new Error('技能 "' + skill.name + '" 没有可修改的文件')
  }

  async setEnabled(name: string, sessionId: string | undefined, enabled: boolean): Promise<{ name: string; enabled: boolean }> {
    const located = await this.locate(name, sessionId)

    if (located.kind === 'missing') throw new Error('技能 "' + name + '" 不存在')
    if (located.kind === 'live') {
      const skill = located.skill
      this.assertEditable(skill)
      if (enabled) return { name, enabled: true }
      const target = skill.path + DISABLED_SUFFIX
      if (await pathExists(target)) throw new Error('目标文件已存在：' + target)
      await rename(skill.path, target)
      return { name, enabled: false }
    }
    const entry = located.entry
    if (enabled === entry.enabled) return { name, enabled }
    const target = enabled ? entry.file.slice(0, -DISABLED_SUFFIX.length) : entry.file + DISABLED_SUFFIX
    if (await pathExists(target)) throw new Error('目标文件已存在：' + target)
    await rename(entry.file, target)
    return { name, enabled }
  }

  async deleteSkill(name: string, sessionId: string | undefined): Promise<{ name: string }> {
    const located = await this.locate(name, sessionId)
    if (located.kind === 'missing') throw new Error('技能 "' + name + '" 不存在')
    if (located.kind === 'live') {
      const skill = located.skill
      this.assertEditable(skill)
      if (basename(skill.path) === 'SKILL.md') await rm(dirname(skill.path), { recursive: true, force: true })
      else await rm(skill.path, { force: true })
      return { name }
    }
    const entry = located.entry
    if (entry.dirBundle) await rm(dirname(entry.file), { recursive: true, force: true })
    else await rm(entry.file, { force: true })
    return { name }
  }

  async migratableEntry(name: string, sessionId: string | undefined): Promise<SkillEntry | undefined> {
    const entry = winnerEntry(await this.fileEntriesAll(), name)
    if (entry !== undefined) return entry
    const located = await this.locate(name, sessionId)
    if (located.kind !== 'live') return undefined
    const skill = located.skill
    if (typeof skill.path !== 'string' || skill.path === '') return undefined
    const { dshHome, agentsHome } = this.homes()
    const userRoots = [join(dshHome, 'skills'), join(agentsHome, 'skills')]
    if (!userRoots.some((root) => this.isWithin(root, skill.path))) return undefined
    this.assertEditable(skill)
    return { name: skill.name, file: skill.path, dirBundle: basename(skill.path) === 'SKILL.md', enabled: true, source: skill.source ?? 'user-dsh' }
  }

  async migrate(name: string, sessionId: string | undefined, payload: { target: string | null; mode: 'copy' | 'move' }): Promise<{ name: string; scope: ScopeInfo }> {
    const { target: rawTarget, mode } = payload
    const { dshHome } = this.homes()
    const targetProject = rawTarget === null || rawTarget === undefined ? null : await normalizeWorkspace(rawTarget)
    const targetRoot = scopeRootOf(targetProject, dshHome)
    const entry = await this.migratableEntry(name, sessionId)
    if (entry === undefined) throw new Error('技能 "' + name + '" 没有可迁移的文件（随部署附带或运行时内置的技能不可迁移）')
    await migrateEntry(entry, targetRoot, mode)
    return { name, scope: this.scopeForTarget(targetRoot, targetProject) }
  }

  async batchMigrate(sessionId: string | undefined, payload: { from: string | null; targets: (string | null)[]; mode: 'copy' | 'move'; names: string[] }): Promise<{ results: Array<{ name: string; target?: string | null; ok: boolean; error?: string }> }> {
    const { from: rawFrom, targets: rawTargets, mode, names } = payload
    if (mode === 'move' && rawTargets.length > 1) throw new Error('移动模式只能选择一个目标作用域（多个目标请改用复制）')
    const { dshHome, agentsHome } = this.homes()
    const fromProject = rawFrom === null || rawFrom === undefined ? null : await normalizeWorkspace(rawFrom)
    const fromRoots: Array<{ path: string; source: string; projectRoot?: string }> = fromProject === null
      ? [{ path: join(dshHome, 'skills'), source: 'user-dsh' }, { path: join(agentsHome, 'skills'), source: 'user-agents' }]
      : [{ path: workspaceSkillRoot(fromProject), source: 'project-dsh', projectRoot: fromProject }]

    const byName = new Map<string, SkillEntry>()
    for (const entry of await collectSkillEntries(fromRoots)) if (!byName.has(entry.name)) byName.set(entry.name, entry)
    const chosen: SkillEntry[] = []
    const results: Array<{ name: string; target?: string | null; ok: boolean; error?: string }> = []
    for (const name of names) {
      const entry = byName.get(name)
      if (entry === undefined) results.push({ name, ok: false, error: '技能 "' + name + '" 不在源作用域中' })
      else chosen.push(entry)
    }
    for (const rawTarget of rawTargets) {
      const targetProject = rawTarget === null || rawTarget === undefined ? null : await normalizeWorkspace(rawTarget)
      const targetRoot = scopeRootOf(targetProject, dshHome)
      if (fromRoots.some((root) => resolvePath(root.path) === resolvePath(targetRoot))) {
        for (const entry of chosen) results.push({ name: entry.name, target: rawTarget ?? null, ok: false, error: '目标作用域与源作用域相同' })
        continue
      }
      for (const item of await batchMigrateEntries(chosen, targetRoot, mode)) {
        results.push({ name: item.name, target: rawTarget ?? null, ok: item.ok, ...(item.error === undefined ? {} : { error: item.error }) })
      }
    }
    return { results }
  }

  async addSkill(sessionId: string | undefined, payload: { kind: 'bundle' | 'flat'; files: Array<{ path: string; base64: string }>; workspace?: string | null }): Promise<{ name: string; kind: 'bundle' | 'flat'; scope: ScopeInfo }> {
    const { kind, files, workspace: rawWorkspace } = payload
    if (files.length > MAX_ADD_FILES) throw new Error('文件数量过多（最多 ' + MAX_ADD_FILES + ' 个）')
    const decoded = files.map((file) => {
      const data = Buffer.from(file.base64, 'base64')
      if (data.length === 0 && file.base64.length > 0) throw new Error('文件内容解码失败：' + file.path)
      return { path: file.path.replaceAll('\\', '/'), data }
    })
    if (decoded.reduce((sum, file) => sum + file.data.length, 0) > MAX_ADD_TOTAL_BYTES) throw new Error('技能总大小超过 8MB 上限')

    for (const file of decoded) {
      if (file.path.startsWith('/') || file.path.split('/').some((segment) => segment === '..' || segment === '.')) throw new Error('非法文件路径：' + file.path)
    }

    const { dshHome } = this.homes()
    let targetProject: string | null | undefined
    let targetRoot: string
    if (rawWorkspace === undefined || rawWorkspace === null || rawWorkspace === '') {
      targetRoot = join(dshHome, 'skills')
    } else {
      targetProject = await normalizeWorkspace(rawWorkspace)
      targetRoot = workspaceSkillRoot(targetProject)
    }

    let name: string
    let writes: Array<{ relative: string; data: Buffer }>
    if (kind === 'bundle') {
      const tops = new Set(decoded.map((file) => file.path.split('/')[0]))
      if (tops.size !== 1 || decoded.some((file) => file.path.split('/').length < 2)) throw new Error('技能文件夹结构不正确：所有文件应位于同一个文件夹内')
      const top = [...tops][0]
      const skillFile = decoded.find((file) => file.path === top + '/SKILL.md')
      if (skillFile === undefined) throw new Error('技能文件夹缺少顶层的 SKILL.md 文件')
      const validation = validateFrontmatter(skillFile.data.toString('utf8'))
      if (!validation.ok) throw new Error('技能格式不符合要求：' + validation.error)
      name = validation.skill.name
      writes = decoded.map((file) => ({ relative: file.path.slice(top.length + 1), data: file.data }))
    } else {
      if (decoded.length !== 1) throw new Error('单个技能文件一次只能添加一个')
      const file = decoded[0]
      const flatName = file.path.split('/').filter(Boolean).pop() ?? ''
      if (!flatName.toLowerCase().endsWith('.md')) throw new Error('技能文件必须是 .md 文件')
      const validation = validateFrontmatter(file.data.toString('utf8'))
      if (!validation.ok) throw new Error('技能格式不符合要求：' + validation.error)
      name = validation.skill.name
      writes = [{ relative: flatName, data: file.data }]
    }

    const existing = winnerEntry(await this.fileEntriesAll(), name)
    if (existing !== undefined) throw new Error('同名技能 "' + name + '" 已存在（' + (existing.enabled ? '已启用' : '已停用') + '，位于 ' + (existing.projectRoot !== undefined ? existing.projectRoot : '全局用户根') + '）')
    const { registry, cwd, scope } = this.viewFor(sessionId)
    if ((await registry.list({ cwd, scope })).some((skill) => skill.name === name)) throw new Error('同名技能 "' + name + '" 已存在')

    const target = kind === 'bundle' ? join(targetRoot, name) : join(targetRoot, writes[0].relative)
    const staging = join(targetRoot, '.dsh-skill-staging-' + process.pid + '-' + Math.random().toString(36).slice(2, 8))
    try {
      if (kind === 'bundle') {
        for (const write of writes) {
          const filePath = join(staging, write.relative)
          await mkdir(dirname(filePath), { recursive: true })
          await writeFile(filePath, write.data)
        }
        await rename(staging, target)
      } else {
        await mkdir(staging, { recursive: true })
        const stagedFile = join(staging, writes[0].relative)
        await writeFile(stagedFile, writes[0].data)
        await rename(stagedFile, target)
        await rm(staging, { recursive: true, force: true }).catch(() => {})
      }
    } catch (error) {
      await rm(staging, { recursive: true, force: true }).catch(() => {})
      await rm(target, { recursive: true, force: true }).catch(() => {})
      throw new Error('写入技能文件失败（已回滚）：' + (error instanceof Error ? error.message : String(error)))
    }

    const accepted = await this.waitForDiscovery(name, sessionId, targetProject ?? cwd)
    if (!accepted) {
      await rm(target, { recursive: true, force: true }).catch(() => {})
      throw new Error('DSH 未接受该技能（格式校验未通过），已回滚。请检查 frontmatter 后重试')
    }
    return { name, kind, scope: targetProject !== undefined && targetProject !== null ? { kind: 'workspace', path: targetProject, label: basename(targetProject) || targetProject } : { kind: 'global' } }
  }

  async waitForDiscovery(name: string, sessionId: string | undefined, probeCwd?: string): Promise<boolean> {
    const { registry, scope } = this.viewFor(sessionId)
    for (let attempt = 0; attempt < 12; attempt++) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 500))
      try {
        if ((await registry.get(name, { cwd: probeCwd, scope })) !== undefined) return true
      } catch {
        return true
      }
    }
    return false
  }
}

export function registerSkillManageRemote(ctx: Context): void {
  new SkillManageApi(ctx)
  ctx.effect(
    () => (ctx as Context & { typert: { register(manifest: typeof MANIFEST): unknown } }).typert.register(MANIFEST),
    'skill-manage: typert manifest',
  )
}

export { MANIFEST, SERVICE, PACKAGE }