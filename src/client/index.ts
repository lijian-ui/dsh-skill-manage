import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { SkillManageSection } from './SkillManageSection.tsx'
import { zh as clientZh, en as clientEn, type Dict } from './client-i18n.ts'

const SECTION_ID = 'skill-manage'
const SECTION_ORDER = 17
const I18N_NS = 'settings.skills'
const SERVICE = 'skillManage'
const PACKAGE = '@lijian-ui/dsh-skill-manage'

export const inject = ['slots', 'locale', 'remote', 'sessions']

type RemoteMethod = (arg: unknown) => Promise<{ ok: boolean; value?: unknown; error?: { code?: string; message?: string } }>
type RemoteRegistry = Record<string, RemoteMethod>
type RemoteCtx = { get(key: string): RemoteRegistry }
type SessionsCtx = { get(key: string): { currentProvideInfo: { getSnapshot(): { sessionId: string | undefined } } } }
type MountCtx = { remote: { $mount(contribution: typeof CONTRIBUTION): Promise<unknown> } }
type EmitCtx = { emit(event: string): void }

const identity = (value: unknown): unknown => value
const codec = (symbol: string) => ({ mode: 'strict' as const, typeSymbol: symbol, schema: { parse: identity } })

const CONTRIBUTION = {
  package: PACKAGE,
  descriptors: [
    {
      id: `${PACKAGE}#${SERVICE}/list`,
      service: SERVICE,
      namespace: SERVICE,
      method: 'list',
      invocation: { kind: 'direct' },
      parameters: [{ name: 'sessionId', wire: 'sessionId', source: 'json', acceptsUndefined: true, codec: codec(`${PACKAGE}#sessionId`) }],
      result: codec(`${PACKAGE}#SkillListResult`),
    },
    {
      id: `${PACKAGE}#${SERVICE}/workspaces`,
      service: SERVICE,
      namespace: SERVICE,
      method: 'workspaces',
      invocation: { kind: 'direct' },
      parameters: [],
      result: codec(`${PACKAGE}#WorkspacesResult`),
    },
    {
      id: `${PACKAGE}#${SERVICE}/migrate`,
      service: SERVICE,
      namespace: SERVICE,
      method: 'migrate',
      invocation: { kind: 'direct' },
      parameters: [
        { name: 'name', wire: 'name', source: 'json', codec: codec(`${PACKAGE}#SkillName`) },
        { name: 'sessionId', wire: 'sessionId', source: 'json', acceptsUndefined: true, codec: codec(`${PACKAGE}#sessionId`) },
        { name: 'payload', wire: 'payload', source: 'json', codec: codec(`${PACKAGE}#MigratePayload`) },
      ],
      result: codec(`${PACKAGE}#MigrateResult`),
    },
    {
      id: `${PACKAGE}#${SERVICE}/batchMigrate`,
      service: SERVICE,
      namespace: SERVICE,
      method: 'batchMigrate',
      invocation: { kind: 'direct' },
      parameters: [
        { name: 'sessionId', wire: 'sessionId', source: 'json', acceptsUndefined: true, codec: codec(`${PACKAGE}#sessionId`) },
        { name: 'payload', wire: 'payload', source: 'json', codec: codec(`${PACKAGE}#BatchMigratePayload`) },
      ],
      result: codec(`${PACKAGE}#BatchMigrateResult`),
    },
    {
      id: `${PACKAGE}#${SERVICE}/content`,
      service: SERVICE,
      namespace: SERVICE,
      method: 'content',
      invocation: { kind: 'direct' },
      parameters: [
        { name: 'name', wire: 'name', source: 'json', codec: codec(`${PACKAGE}#SkillName`) },
        { name: 'sessionId', wire: 'sessionId', source: 'json', acceptsUndefined: true, codec: codec(`${PACKAGE}#sessionId`) },
      ],
      result: codec(`${PACKAGE}#SkillContent`),
    },
    {
      id: `${PACKAGE}#${SERVICE}/setEnabled`,
      service: SERVICE,
      namespace: SERVICE,
      method: 'setEnabled',
      invocation: { kind: 'direct' },
      parameters: [
        { name: 'name', wire: 'name', source: 'json', codec: codec(`${PACKAGE}#SkillName`) },
        { name: 'sessionId', wire: 'sessionId', source: 'json', acceptsUndefined: true, codec: codec(`${PACKAGE}#sessionId`) },
        { name: 'enabled', wire: 'enabled', source: 'json', codec: codec(`${PACKAGE}#EnabledFlag`) },
      ],
      result: codec(`${PACKAGE}#SetEnabledResult`),
    },
    {
      id: `${PACKAGE}#${SERVICE}/deleteSkill`,
      service: SERVICE,
      namespace: SERVICE,
      method: 'deleteSkill',
      invocation: { kind: 'direct' },
      parameters: [
        { name: 'name', wire: 'name', source: 'json', codec: codec(`${PACKAGE}#SkillName`) },
        { name: 'sessionId', wire: 'sessionId', source: 'json', acceptsUndefined: true, codec: codec(`${PACKAGE}#sessionId`) },
      ],
      result: codec(`${PACKAGE}#DeleteSkillResult`),
    },
    {
      id: `${PACKAGE}#${SERVICE}/addSkill`,
      service: SERVICE,
      namespace: SERVICE,
      method: 'addSkill',
      invocation: { kind: 'direct' },
      parameters: [
        { name: 'sessionId', wire: 'sessionId', source: 'json', acceptsUndefined: true, codec: codec(`${PACKAGE}#sessionId`) },
        { name: 'payload', wire: 'payload', source: 'json', codec: codec(`${PACKAGE}#AddPayload`) },
      ],
      result: codec(`${PACKAGE}#AddResult`),
    },
  ],
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(I18N_NS, { zh: clientZh, en: clientEn }), 'skill-manage: client dictionaries')

  const t = ctx.locale.bind(I18N_NS) as (key: keyof Dict) => string
  const mount = (ctx as ClientContext & MountCtx).remote.$mount(CONTRIBUTION)
  const currentSessionId = (): string | undefined => (ctx as unknown as SessionsCtx).get('sessions').currentProvideInfo.getSnapshot().sessionId

  const callRemote = async (method: string, ...args: unknown[]): Promise<unknown> => {
    await mount
    const remote = (ctx as unknown as RemoteCtx).get(`remote.${SERVICE}`)
    const result = await remote[method](...args)
    if (!result.ok) throw new Error(`${SERVICE}.${method} failed: ${result.error?.code}: ${result.error?.message}`)
    return result.value
  }

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: SECTION_ID,
    order: SECTION_ORDER,
    label: () => t('nav'),
    locale: I18N_NS,
    inject: () => ({
      t,
      currentSessionId,
      listSkills: () => callRemote('list', currentSessionId()),
      listWorkspaces: () => callRemote('workspaces'),
      loadContent: (name: string) => callRemote('content', name, currentSessionId()),
      setSkillEnabled: (name: string, enabled: boolean) => callRemote('setEnabled', name, currentSessionId(), enabled),
      batchMigrateSkill: (payload: { from: string | null; targets: (string | null)[]; mode: 'copy' | 'move'; names: string[] }) => callRemote('batchMigrate', currentSessionId(), payload),
      removeSkill: (name: string) => callRemote('deleteSkill', name, currentSessionId()),
      addSkill: (payload: { kind: 'bundle' | 'flat'; files: Array<{ path: string; base64: string }>; workspace: string | null }) => callRemote('addSkill', currentSessionId(), payload),
      refreshSkillCache: () => (ctx as unknown as EmitCtx).emit('connection/reset'),
    }),
  }, SkillManageSection))
}