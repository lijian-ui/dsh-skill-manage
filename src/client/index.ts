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
      id: `${PACKAGE}#${SERVICE}/importZip`,
      service: SERVICE,
      namespace: SERVICE,
      method: 'importZip',
      invocation: { kind: 'direct' },
      parameters: [
        { name: 'sessionId', wire: 'sessionId', source: 'json', acceptsUndefined: true, codec: codec(`${PACKAGE}#sessionId`) },
        { name: 'payload', wire: 'payload', source: 'json', codec: codec(`${PACKAGE}#ZipPayload`) },
      ],
      result: codec(`${PACKAGE}#ZipResult`),
    },
  ],
}

// 官方设置外壳（dsh-client-ui-settings-general）的 navIcon() 按 section id 硬编码映射，
// 未识别的 id 一律回退到齿轮。官方未提供图标扩展点，故在客户端监听 DOM，
// 将「技能管理」导航项的齿轮替换为官方图标库同款 IconSkillOutline16 的 SVG。
// 若未来官方开放了图标注册接口，应优先改用官方方案并移除此处补丁。
const NAV_LABELS = new Set<string>([clientZh.nav, clientEn.nav])

const SKILL_NAV_SVG = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" data-skm-nav="1">'
  + '<path d="M12.5113 15.4067C12.4395 15.6249 12.1308 15.6249 12.059 15.4067L11.643 14.1416C11.454 13.567 11.0033 13.1164 10.4288 12.9274L9.16369 12.5113C8.94544 12.4395 8.94544 12.1308 9.16369 12.059L10.4288 11.643C11.0033 11.454 11.454 11.0033 11.643 10.4288L12.059 9.16369C12.1308 8.94544 12.4395 8.94544 12.5113 9.16369L12.9274 10.4288C13.1164 11.0033 13.567 11.454 14.1416 11.643L15.4067 12.059C15.6249 12.1308 15.6249 12.4395 15.4067 12.5113L14.1416 12.9274C13.567 13.1164 13.1164 13.567 12.9274 14.1416L12.5113 15.4067Z" fill="currentColor"/>'
  + '<path d="M9.02246 0.546878C9.9822 0.546878 10.7564 0.545403 11.374 0.612307C12.0042 0.680586 12.5515 0.826244 13.0273 1.17188C13.3052 1.37376 13.5501 1.61868 13.752 1.89649C14.0975 2.37225 14.2432 2.91984 14.3115 3.54981C14.3784 4.16727 14.377 4.94206 14.377 5.90137V8.51367C13.9611 8.29533 13.5071 8.13985 13.0273 8.06055V5.90137C13.0273 4.9121 13.0259 4.22322 12.9688 3.69532C12.9129 3.18044 12.8098 2.89782 12.6592 2.69043C12.5406 2.52724 12.3966 2.38326 12.2334 2.26465C12.026 2.11404 11.7437 2.0109 11.2285 1.95508C10.7005 1.89789 10.0122 1.89649 9.02246 1.89649H6.55371C5.56395 1.89649 4.87569 1.89787 4.34766 1.95508C3.83242 2.01092 3.55022 2.11398 3.34278 2.26465C3.17953 2.38329 3.03564 2.52719 2.91699 2.69043C2.76642 2.89782 2.66325 3.18042 2.60742 3.69532C2.55027 4.22322 2.54883 4.9121 2.54883 5.90137V10.0986C2.54883 11.0878 2.55031 11.7768 2.60742 12.3047C2.66326 12.8196 2.76642 13.1032 2.91699 13.3105C3.03558 13.4736 3.17966 13.6178 3.34278 13.7363C3.5502 13.8869 3.83265 13.9901 4.34766 14.0459C4.87568 14.1031 5.56398 14.1035 6.55371 14.1035H8.08399C8.27443 14.6025 8.55077 15.0585 8.89551 15.4541H6.55371C5.59402 15.4541 4.81976 15.4546 4.20215 15.3877C3.57204 15.3194 3.02468 15.1738 2.54883 14.8281C2.27111 14.6263 2.02606 14.3813 1.82422 14.1035C1.47883 13.6278 1.33293 13.08 1.26465 12.4502C1.19783 11.8327 1.19922 11.0579 1.19922 10.0986V5.90137C1.19922 4.94206 1.1978 4.16727 1.26465 3.54981C1.33295 2.91984 1.47867 2.37225 1.82422 1.89649C2.02613 1.61864 2.27098 1.37379 2.54883 1.17188C3.02472 0.826181 3.57197 0.6806 4.20215 0.612307C4.81976 0.545393 5.594 0.546877 6.55371 0.546878H9.02246ZM9.19629 9.14649H4.5459V7.84571H9.19629V9.14649ZM11.0303 6.10645H4.5459V4.80567H11.0303V6.10645Z" fill="currentColor"/>'
  + '</svg>'

function patchSkillNavIcon(): void {
  if (typeof document === 'undefined') return
  for (const span of Array.from(document.querySelectorAll('button > span'))) {
    if (!NAV_LABELS.has(span.textContent ?? '')) continue
    const button = span.parentElement
    if (button === null) continue
    const stale = button.querySelector('svg:not([data-skm-nav])')
    if (stale === null) continue
    const template = document.createElement('template')
    template.innerHTML = SKILL_NAV_SVG
    const next = template.content.firstElementChild
    if (next === null) continue
    const cls = stale.getAttribute('class')
    if (cls !== null) next.setAttribute('class', cls)
    stale.replaceWith(next)
  }
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
      removeSkill: (name: string) => callRemote('deleteSkill', name, currentSessionId()),
      importSkillZip: (base64: string) => callRemote('importZip', currentSessionId(), { base64 }),
      refreshSkillCache: () => (ctx as unknown as EmitCtx).emit('connection/reset'),
    }),
  }, SkillManageSection))

  // 导航图标补丁：面板可能随时挂载/重渲染（打开设置、切换语言），用微任务合并的 MutationObserver 持续修补
  if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined' && document.body !== null) {
    let scheduled = false
    const schedule = (): void => {
      if (scheduled) return
      scheduled = true
      queueMicrotask(() => {
        scheduled = false
        patchSkillNavIcon()
      })
    }
    patchSkillNavIcon()
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true })
  }
}