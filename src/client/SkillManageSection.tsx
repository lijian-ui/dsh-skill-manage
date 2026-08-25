import { useEffect, useMemo, useRef, useState, type ReactNode, type ChangeEvent } from 'react'
import { IconSearchOutline16, IconSkillOutline16, MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Dict } from './client-i18n.ts'

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

interface SkillContent {
  name: string
  description: string
  content: string
  provider: string
  whenToUse?: string
  path?: string
}

interface WorkspaceInfo {
  path: string
  label: string
  sessions: number
}

interface SkillManageSectionProps {
  t: (key: keyof Dict) => string
  currentSessionId: () => string | undefined
  listSkills: () => Promise<{ skills: SkillSummary[] }>
  listWorkspaces: () => Promise<{ workspaces: WorkspaceInfo[] }>
  loadContent: (name: string) => Promise<SkillContent | null>
  setSkillEnabled: (name: string, enabled: boolean) => Promise<{ name: string; enabled: boolean }>
  removeSkill: (name: string) => Promise<{ name: string }>
  importSkillZip: (base64: string) => Promise<{ name: string }>
  refreshSkillCache: () => void
}

const CSS_TEXT = `
.SKM_section{width:100%;max-width:760px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:14px;display:flex}
.SKM_status{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px;margin:0}
.SKM_failure{color:var(--dsw-alias-state-error-primary);align-items:center;gap:10px;display:flex}
.SKM_failure p{margin:0}
.SKM_failure button{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;background:0 0;border-radius:6px;padding:4px 10px}
.SKM_catalog{flex-direction:column;gap:12px;display:flex}
.SKM_search{width:100%;color:var(--dsw-alias-label-tertiary);align-items:center;display:flex;position:relative}
.SKM_search>svg{pointer-events:none;position:absolute;left:12px}
.SKM_search input{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);width:100%;height:36px;color:var(--dsw-alias-label-primary);font:inherit;border-radius:8px;outline:none;padding:0 34px 0 36px;font-size:13px}
.SKM_search input::placeholder{color:var(--dsw-alias-label-tertiary)}
.SKM_search input:focus-visible{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-business-primary) 18%, transparent)}
.SKM_catalogHeading{align-items:baseline;gap:7px;padding:0 2px;display:flex}
.SKM_catalogHeading h3{font-size:13px;font-weight:600;line-height:20px;margin:0}
.SKM_catalogHeading span{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;font-size:12px;line-height:18px}
.SKM_cards{flex-direction:column;gap:8px;margin:0;padding:0;list-style:none;display:flex}
.SKM_card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:10px;min-width:0;overflow:hidden;transition:border-color .15s ease}
.SKM_card:hover{border-color:var(--dsw-alias-border-l1)}
.SKM_cardRow{box-sizing:border-box;width:100%;align-items:center;gap:10px;font:inherit;color:var(--dsw-alias-label-primary);background:0 0;border:none;padding:10px 12px;display:flex;text-align:left}
.SKM_cardInfo{min-width:0;flex:1;cursor:pointer;display:flex;align-items:center;gap:8px}
.SKM_cardLeading{width:16px;height:16px;color:var(--dsw-alias-label-tertiary);flex:none;justify-content:center;align-items:center;display:inline-flex}
.SKM_cardText{min-width:0;flex:1;display:flex;flex-direction:column;gap:2px}
.SKM_cardTitle{text-overflow:ellipsis;white-space:nowrap;overflow:hidden;font-size:13px;font-weight:500;line-height:20px;transition:color .2s ease;margin:0}
.SKM_cardTitle[data-disabled=true]{color:var(--dsw-alias-label-tertiary)}
.SKM_cardDesc{text-overflow:ellipsis;white-space:nowrap;overflow:hidden;font-size:12px;line-height:16px;color:var(--dsw-alias-label-tertiary);margin:0}
.SKM_cardActions{align-items:center;gap:8px;display:inline-flex;flex:none}
.SKM_switch{width:36px;height:21px;border-radius:999px;border:none;background:var(--dsw-alias-border-l2);position:relative;cursor:pointer;flex:none;padding:0;transition:background-color .15s ease}
.SKM_switch[data-on=true]{background:var(--dsw-alias-state-business-primary,#185FA5)}
.SKM_switch:disabled{cursor:default;opacity:.6}
.SKM_switchThumb{position:absolute;left:2px;top:2px;width:17px;height:17px;border-radius:50%;background:var(--dsw-alias-label-primary-foreground);box-shadow:0 1px 2px rgba(0,0,0,.25);transition:left .15s ease}
.SKM_switch[data-on=true] .SKM_switchThumb{left:17px}
.SKM_deleteBtn{font:inherit;color:var(--dsw-alias-state-error-primary);cursor:pointer;background:0 0;border:1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 40%, transparent);border-radius:6px;padding:3px 8px;font-size:11px;line-height:16px}
.SKM_deleteBtn:hover:not(:disabled){background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent)}
.SKM_deleteBtn:disabled{cursor:default;opacity:.6}
.SKM_opError{color:var(--dsw-alias-state-error-primary);font-size:11px;line-height:16px}
.SKM_addActions{margin-left:auto;align-items:center;gap:6px;display:inline-flex;position:relative}
.SKM_addButton{box-sizing:border-box;width:28px;height:28px;color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;background:0 0;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;padding:0;display:inline-flex;align-items:center;justify-content:center}
.SKM_addButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-solid)}
.SKM_addButton:disabled{cursor:default;opacity:.6}
.SKM_addStatus{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;margin:0}
.SKM_addErrorBanner{border:1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 40%, transparent);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent);border-radius:8px;align-items:center;gap:10px;padding:8px 12px;display:flex}
.SKM_addErrorText{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px;flex:1;min-width:0}
.SKM_addDismiss{font:inherit;color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:2px 10px;font-size:12px;line-height:18px;flex:none}
.SKM_addDismiss:hover{background:var(--dsw-alias-interactive-bg-hover-solid)}
.SKM_fileInput{display:none}
.SKM_scopeBar{gap:6px;padding:2px;max-width:100%;overflow-x:auto;scrollbar-width:thin;display:flex;align-items:center}
.SKM_scopeChip{font:inherit;color:var(--dsw-alias-label-secondary);cursor:pointer;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:999px;padding:3px 12px;font-size:12px;line-height:18px;white-space:nowrap;flex:none;display:inline-flex;align-items:center;gap:6px}
.SKM_scopeChip:hover{background:var(--dsw-alias-interactive-bg-hover)}
.SKM_scopeChip[data-active=true]{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 12%, transparent);border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary)}
.SKM_scopeChipCount{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;font-size:11px;line-height:16px}
.SKM_scopeChip[data-active=true] .SKM_scopeChipCount{color:var(--dsw-alias-state-business-primary)}
.SKM_visuallyHidden{position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;clip:rect(0 0 0 0);overflow:hidden;white-space:nowrap}
.SKM_detailOverlay{position:fixed;inset:0;background:var(--dsw-alias-bg-mask-1);align-items:center;justify-content:center;display:flex;z-index:1000}
.SKM_detailBox{background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;box-shadow:var(--dsw-shadow-lv2);width:640px;max-width:calc(100vw - 48px);max-height:85vh;flex-direction:column;display:flex}
.SKM_detailHeader{align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--dsw-alias-border-l3);display:flex}
.SKM_detailTitle{font-size:15px;font-weight:600;line-height:22px;margin:0;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.SKM_detailClose{font:inherit;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:4px 12px;font-size:13px;line-height:20px;flex:none}
.SKM_detailClose:hover{background:var(--dsw-alias-interactive-bg-hover-solid)}
.SKM_confirmBox{background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;box-shadow:var(--dsw-shadow-lv2);width:400px;max-width:calc(100vw - 48px);flex-direction:column;gap:16px;padding:20px;display:flex}
.SKM_confirmText{font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary);margin:0}
.SKM_confirmActions{align-items:center;justify-content:flex-end;gap:8px;display:flex}
.SKM_confirmCancel{font:inherit;color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:6px 16px;font-size:13px;line-height:20px}
.SKM_confirmCancel:hover{background:var(--dsw-alias-interactive-bg-hover-solid)}
.SKM_confirmDelete{font:inherit;color:var(--dsw-alias-state-error-primary);cursor:pointer;background:0 0;border:1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 40%, transparent);border-radius:8px;padding:6px 16px;font-size:13px;line-height:20px}
.SKM_confirmDelete:hover:not(:disabled){background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent)}
.SKM_confirmDelete:disabled{cursor:default;opacity:.6}
.SKM_detailBody{flex:1;overflow-y:auto;padding:16px;flex-direction:column;gap:16px;display:flex}
.SKM_detailMeta{border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-layer-1);border-radius:8px;padding:12px;flex-direction:column;gap:6px;display:flex}
.SKM_detailMetaTitle{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary);margin:0;text-transform:uppercase;letter-spacing:.5px}
.SKM_detailMetaRow{align-items:baseline;gap:8px;display:flex;font-size:13px;line-height:20px}
.SKM_detailMetaKey{color:var(--dsw-alias-label-tertiary);flex:none;font-weight:500;min-width:80px}
.SKM_detailMetaVal{color:var(--dsw-alias-label-primary);flex:1;min-width:0;word-break:break-word}
.SKM_detailMetaVal code{font-family:var(--dsw-alias-font-family-mono,ui-monospace,monospace);font-size:12px;background:var(--dsw-alias-bg-layer-2);border-radius:4px;padding:1px 4px}
.SKM_detailContent{flex:1;min-height:0;flex-direction:column;display:flex}
.SKM_detailMd{flex:1;min-height:0;overflow-y:auto}
.SKM_detailMd>div{font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary)}
.SKM_detailMd>div h1{font-size:18px;font-weight:600;margin:12px 0 8px}
.SKM_detailMd>div h2{font-size:16px;font-weight:600;margin:10px 0 6px}
.SKM_detailMd>div h3{font-size:14px;font-weight:600;margin:8px 0 4px}
.SKM_detailMd>div p{margin:0 0 8px}
.SKM_detailMd>div ul,.SKM_detailMd>div ol{margin:0 0 8px;padding-left:20px}
.SKM_detailMd>div li{margin:2px 0}
.SKM_detailMd>div pre{background:var(--dsw-alias-bg-layer-1);border-radius:6px;padding:8px 12px;overflow-x:auto;font-size:12px;line-height:18px;margin:0 0 8px}
.SKM_detailMd>div code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.SKM_detailMd>div blockquote{border-left:3px solid var(--dsw-alias-border-l2);padding-left:12px;color:var(--dsw-alias-label-secondary);margin:0 0 8px}
.SKM_detailMd>div table{border-collapse:collapse;margin:0 0 8px}
.SKM_detailMd>div th,.SKM_detailMd>div td{border:1px solid var(--dsw-alias-border-l2);padding:4px 8px;font-size:12px}
.SKM_detailMd>div hr{border:none;border-top:1px solid var(--dsw-alias-border-l2);margin:8px 0}
.SKM_detailContentTitle{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary);margin:0;text-transform:uppercase;letter-spacing:.5px}
.SKM_md{font-size:13px;line-height:22px;color:var(--dsw-alias-label-primary)}
.SKM_md h1{font-size:18px;font-weight:600;line-height:26px;margin:8px 0 4px}
.SKM_md h2{font-size:16px;font-weight:600;line-height:24px;margin:8px 0 4px}
.SKM_md h3{font-size:14px;font-weight:600;line-height:22px;margin:6px 0 2px}
.SKM_md p{margin:0 0 8px}
.SKM_md ul,.SKM_md ol{margin:0 0 8px;padding-left:20px}
.SKM_md li{margin:2px 0}
.SKM_md code{font-family:var(--dsw-alias-font-family-mono,ui-monospace,monospace);font-size:12px;background:var(--dsw-alias-bg-layer-2);border-radius:4px;padding:1px 5px}
.SKM_md pre{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l3);border-radius:8px;padding:10px 12px;overflow-x:auto;margin:0 0 8px}
.SKM_md pre code{background:0 0;border:none;padding:0;font-size:12px;line-height:18px}
.SKM_md strong{font-weight:600}
.SKM_md em{font-style:italic}
.SKM_md blockquote{border-left:3px solid var(--dsw-alias-border-l2);margin:0 0 8px;padding:4px 12px;color:var(--dsw-alias-label-secondary)}
.SKM_md hr{border:none;border-top:1px solid var(--dsw-alias-border-l3);margin:8px 0}
.SKM_detailLoading{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px;margin:0;text-align:center;padding:20px}
.SKM_detailError{color:var(--dsw-alias-state-error-primary);font-size:13px;line-height:20px;margin:0;text-align:center;padding:20px}
.SKM_scopeOverlay{position:fixed;inset:0;background:var(--dsw-alias-bg-mask-1);align-items:center;justify-content:center;display:flex;z-index:1000}
.SKM_scopeBox{background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;box-shadow:var(--dsw-shadow-lv2);width:440px;max-width:calc(100vw - 48px);max-height:80vh;flex-direction:column;padding:16px;gap:12px;display:flex}
.SKM_scopeBox h4{font-size:14px;font-weight:600;line-height:20px;margin:0}
.SKM_scopeOptions{flex-direction:column;gap:8px;display:flex}
.SKM_scopeOption{font:inherit;color:var(--dsw-alias-label-primary);cursor:pointer;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:8px 12px;font-size:13px;line-height:20px;text-align:left;display:flex;align-items:center;gap:8px}
.SKM_scopeOption[data-active=true]{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 1px color-mix(in srgb, var(--dsw-alias-state-business-primary) 30%, transparent)}
.SKM_scopeOption input{margin:0;accent-color:var(--dsw-alias-state-business-primary)}
.SKM_wsPath{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.SKM_scopeHint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;margin:0}
.SKM_scopeActions{margin-top:auto;justify-content:flex-end;gap:8px;display:flex}
.SKM_scopeAction{font:inherit;cursor:pointer;border-radius:8px;padding:6px 14px;font-size:13px;line-height:20px}
.SKM_scopeCancel{color:var(--dsw-alias-label-primary);background:0 0;border:1px solid var(--dsw-alias-border-l2)}
.SKM_scopeCancel:hover{background:var(--dsw-alias-interactive-bg-hover-solid)}
.SKM_scopeConfirm{color:var(--dsw-alias-label-primary-foreground);background:var(--dsw-alias-state-business-primary);border:none}
.SKM_scopeConfirm:disabled{cursor:default;opacity:.6}
`

const TAG_ID = '@lijian-ui/dsh-skill-manage/SkillManageSection.module.css'

function injectCss(): void {
  if (typeof document !== 'undefined' && document.querySelector(`style[data-plugin-css="${TAG_ID}"]`) === null) {
    const tag = document.createElement('style')
    tag.dataset.plugin = '@lijian-ui/dsh-skill-manage'
    tag.dataset.pluginCss = TAG_ID
    tag.textContent = CSS_TEXT
    document.head.appendChild(tag)
  }
}

type Translate = (key: keyof Dict) => string

function parseFrontmatter(raw: string): { frontmatter: Record<string, unknown> | null; body: string } {
  const trimmed = raw.trimStart()
  if (!trimmed.startsWith('---')) return { frontmatter: null, body: raw }
  const end = trimmed.indexOf('\n---', 3)
  if (end === -1) return { frontmatter: null, body: raw }
  const yamlText = trimmed.slice(3, end).trim()
  const body = trimmed.slice(end + 4).replace(/^\s*\n/, '')
  const frontmatter: Record<string, unknown> = {}
  for (const line of yamlText.split('\n')) {
    const m = line.match(/^(\w[\w-]*)\s*:\s*(.*)$/)
    if (!m) continue
    const [, key, val] = m
    if (val === 'true') frontmatter[key] = true
    else if (val === 'false') frontmatter[key] = false
    else if (val === '') frontmatter[key] = ''
    else if (/^-?\d+$/.test(val)) frontmatter[key] = parseInt(val, 10)
    else frontmatter[key] = val.replace(/^["']|["']$/g, '')
  }
  return { frontmatter, body }
}

function DetailContent({ raw }: { raw: string }): ReactNode {
  const { frontmatter, body } = useMemo(() => parseFrontmatter(raw), [raw])
  const metaKeys = frontmatter !== null ? Object.keys(frontmatter) : []
  return (
    <>
      {metaKeys.length > 0 ? (
        <div className="SKM_detailMeta">
          <p className="SKM_detailMetaTitle">Frontmatter</p>
          {metaKeys.map((k) => (
            <div key={k} className="SKM_detailMetaRow">
              <span className="SKM_detailMetaKey">{k}</span>
              <span className="SKM_detailMetaVal">{String(frontmatter![k])}</span>
            </div>
          ))}
        </div>
      ) : null}
      <div className="SKM_detailMd">
        <MarkdownText text={body} />
      </div>
    </>
  )
}

interface ListStateLoading { status: 'loading' }
interface ListStateError { status: 'error' }
interface ListStateReady { status: 'ready'; skills: SkillSummary[] }
type ListState = ListStateLoading | ListStateError | ListStateReady

interface DetailState {
  skill: SkillSummary
  body: { status: 'loading' | 'error' | 'missing' | 'ready'; content?: SkillContent | null }
}

interface AddingState { status: 'idle' | 'busy' | 'ok' | 'error'; message?: string }

export function SkillManageSection(props: SkillManageSectionProps): ReactNode {
  const { t, currentSessionId, listSkills, loadContent, setSkillEnabled, removeSkill, importSkillZip, listWorkspaces, refreshSkillCache } = props
  const [query, setQuery] = useState('')
  const [listState, setListState] = useState<ListState>({ status: 'loading' })
  const [request, setRequest] = useState(0)
  const [detail, setDetail] = useState<DetailState | null>(null)
  const [ops, setOps] = useState<Record<string, { status: 'busy' | 'ok' | 'error' }>>({})
  const [adding, setAdding] = useState<AddingState>({ status: 'idle' })
  const [wsOptions, setWsOptions] = useState<WorkspaceInfo[] | null>(null)
  const [scopeFilter, setScopeFilter] = useState('global')
  const [deleteConfirm, setDeleteConfirm] = useState<SkillSummary | null>(null)
  const inflight = useRef(new Set<string>())
  const zipInput = useRef<HTMLInputElement>(null)

  useEffect(() => { injectCss() }, [])

  useEffect(() => {
    let current = true
    setListState((prev) => (prev.status === 'ready' ? prev : { status: 'loading' }))
    Promise.resolve().then(() => listSkills()).then((snapshot) => {
      if (!current) return
      const skills = snapshot !== null && typeof snapshot === 'object' && Array.isArray(snapshot.skills) ? [...snapshot.skills].sort((a, b) => a.name.localeCompare(b.name)) : []
      setListState({ status: 'ready', skills })
    }, () => {
      if (current) setListState({ status: 'error' })
    })
    return () => { current = false }
  }, [listSkills, request])

  useEffect(() => {
    let current = true
    Promise.resolve().then(() => listWorkspaces()).then((snapshot) => {
      if (!current) return
      setWsOptions(snapshot !== null && typeof snapshot === 'object' && Array.isArray(snapshot.workspaces) ? snapshot.workspaces : [])
    }, () => {
      if (current) setWsOptions([])
    })
    return () => { current = false }
  }, [listWorkspaces])

  const refresh = (): void => {
    setDetail(null)
    setRequest((value) => value + 1)
  }

  const reloadAfterHot = (): void => {
    setTimeout(() => {
      refreshSkillCache()
      setRequest((value) => value + 1)
    }, 800)
  }

  const applySetEnabled = (skill: SkillSummary): void => {
    const target = skill.enabled !== true
    setOps((prev) => ({ ...prev, [skill.name]: { status: 'busy' } }))
    Promise.resolve().then(() => setSkillEnabled(skill.name, target)).then(() => {
      setListState((prev) => (prev.status === 'ready' ? { status: 'ready', skills: prev.skills.map((s) => (s.name === skill.name ? { ...s, enabled: target } : s)) } : prev))
      setOps((prev) => ({ ...prev, [skill.name]: { status: 'ok' } }))
      if (detail !== null && detail.skill.name === skill.name) setDetail((d) => (d === null ? d : { ...d, skill: { ...d.skill, enabled: target } }))
      reloadAfterHot()
    }, () => {
      setOps((prev) => ({ ...prev, [skill.name]: { status: 'error' } }))
    })
  }

  const applyRemove = (skill: SkillSummary): void => {
    setOps((prev) => ({ ...prev, [skill.name]: { status: 'busy' } }))
    Promise.resolve().then(() => removeSkill(skill.name)).then(() => {
      setListState((prev) => (prev.status === 'ready' ? { status: 'ready', skills: prev.skills.filter((s) => s.name !== skill.name) } : prev))
      setOps((prev) => ({ ...prev, [skill.name]: { status: 'ok' } }))
      if (detail !== null && detail.skill.name === skill.name) setDetail(null)
      reloadAfterHot()
    }, () => {
      setOps((prev) => ({ ...prev, [skill.name]: { status: 'error' } }))
    })
  }

  const openDetail = (skill: SkillSummary): void => {
    setDetail({ skill, body: { status: 'loading' } })
    if (inflight.current.has(skill.name)) return
    inflight.current.add(skill.name)
    Promise.resolve().then(() => loadContent(skill.name)).then((content) => {
      inflight.current.delete(skill.name)
      setDetail((d) => (d === null || d.skill.name !== skill.name ? d : { ...d, body: { status: content === null ? 'missing' : 'ready', content } }))
    }, () => {
      inflight.current.delete(skill.name)
      setDetail((d) => (d === null || d.skill.name !== skill.name ? d : { ...d, body: { status: 'error' } }))
    })
  }

  const readFileAsBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const bytes = new Uint8Array(reader.result as ArrayBuffer)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
      resolve(btoa(binary))
    }
    reader.onerror = () => reject(new Error('file read failed'))
    reader.readAsArrayBuffer(file)
  })

  const cleanHostError = (error: unknown): string => String((error as { message?: string })?.message ?? error).replace(/^skillManage\.[a-zA-Z]+ failed: [a-z-]+: /, '')

  const onPickZip = (event: ChangeEvent<HTMLInputElement>): void => {
    const input = event.currentTarget
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setAdding({ status: 'error', message: t('addNotZip') })
      return
    }
    setAdding({ status: 'busy' })
    Promise.resolve().then(() => readFileAsBase64(file)).then((base64) => importSkillZip(base64)).then(() => {
      setAdding({ status: 'ok' })
      setTimeout(() => setRequest((value) => value + 1), 700)
      setTimeout(() => setAdding({ status: 'idle' }), 2500)
    }, (error) => {
      setAdding({ status: 'error', message: cleanHostError(error) })
    })
  }

  useEffect(() => {
    if (detail === null || typeof document === 'undefined') return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setDetail(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [detail])

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const skills = listState.status === 'ready' ? listState.skills : []
  const scopeOf = (skill: SkillSummary): string => (skill.scope !== undefined && skill.scope !== null && skill.scope.kind === 'workspace' ? skill.scope.path ?? 'global' : 'global')
  const labelOf = (path: string): string => {
    const parts = String(path).replaceAll('\\', '/').split('/').filter(Boolean)
    return parts.length > 0 ? parts[parts.length - 1] : String(path)
  }
  const knownPaths = (Array.isArray(wsOptions) ? wsOptions : []).map((workspace) => workspace.path)
  const scopeKeys = ['global', ...knownPaths.filter((path) => path !== 'global')]
  if (scopeFilter !== 'global' && !scopeKeys.includes(scopeFilter)) scopeKeys.push(scopeFilter)
  const scopeCount = (key: string): number => skills.reduce((sum, skill) => sum + (scopeOf(skill) === key ? 1 : 0), 0)
  const scoped = skills.filter((skill) => scopeOf(skill) === scopeFilter)
  const filtered = scoped.filter((skill) => skill.name.toLocaleLowerCase().includes(normalizedQuery))

  return (
    <div className="SKM_section" aria-busy={listState.status === 'loading'}>
      {listState.status === 'loading' ? (
        <p className="SKM_status">{t('loading')}</p>
      ) : listState.status === 'error' ? (
        <div className="SKM_failure">
          <p role="alert">{t('error')}</p>
          <button type="button" onClick={refresh}>{t('retry')}</button>
        </div>
      ) : (
        <div className="SKM_catalog">
          <label className="SKM_search">
            <IconSearchOutline16 aria-hidden="true" />
            <span className="SKM_visuallyHidden">{t('search')}</span>
            <input type="search" value={query} placeholder={t('search')} aria-label={t('search')} onChange={(event) => setQuery(event.currentTarget.value)} />
          </label>
          <div className="SKM_catalogHeading">
            <h3>{t('catalog')}</h3>
            <span data-skill-count={filtered.length}>{filtered.length}</span>
            <span className="SKM_addActions">
              <button type="button" className="SKM_addButton" aria-label={t('addButton')} title={t('addButton')} disabled={adding.status === 'busy'} onClick={() => zipInput.current?.click()}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M8 3.5v9" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
                  <path d="M3.5 8h9" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
                </svg>
              </button>
            </span>
          </div>
          <div className="SKM_scopeBar" role="tablist">
            {scopeKeys.map((key) => (
              <button key={key} type="button" role="tab" aria-selected={scopeFilter === key} className="SKM_scopeChip" data-active={scopeFilter === key ? 'true' : undefined} onClick={() => setScopeFilter(key)}>
                <span title={key === 'global' ? t('scopeGlobal') : key}>{key === 'global' ? t('scopeGlobal') : labelOf(key)}</span>
                <span className="SKM_scopeChipCount">{scopeCount(key)}</span>
              </button>
            ))}
          </div>
          {adding.status === 'busy' ? <p className="SKM_addStatus">{t('addBusy')}</p> : null}
          {adding.status === 'error' ? (
            <div className="SKM_addErrorBanner" role="alert">
              <span className="SKM_addErrorText">{adding.message}</span>
              <button type="button" className="SKM_addDismiss" onClick={() => setAdding({ status: 'idle' })}>{t('addDismiss')}</button>
            </div>
          ) : null}
          {currentSessionId() === undefined ? <p className="SKM_status">{t('noSession')}</p> : null}
          {skills.length === 0 && currentSessionId() !== undefined ? <p className="SKM_status">{t('empty')}</p> : null}
          {skills.length > 0 && scoped.length === 0 ? <p className="SKM_status">{t('emptyScope')}</p> : null}
          {scoped.length > 0 && filtered.length === 0 ? <p className="SKM_status">{t('emptySearch')}</p> : null}
          {filtered.length > 0 ? (
            <ul className="SKM_cards">
              {filtered.map((skill) => {
                const enabled = skill.enabled !== false
                const editable = skill.source !== 'bundled' && skill.source !== 'runtime'
                const op = ops[skill.name]
                return (
                  <li key={skill.name} className="SKM_card">
                    <div className="SKM_cardRow">
                      <div className="SKM_cardInfo" onClick={() => openDetail(skill)}>
                        <span className="SKM_cardLeading"><IconSkillOutline16 size={14} /></span>
                        <span className="SKM_cardText">
                          <strong className="SKM_cardTitle" data-disabled={enabled ? undefined : 'true'} title={skill.name}>{skill.name}</strong>
                          <span className="SKM_cardDesc">{skill.description}</span>
                        </span>
                      </div>
                      <span className="SKM_cardActions">
                        {editable ? (
                          <button type="button" role="switch" className="SKM_switch" data-on={enabled ? 'true' : undefined} aria-checked={enabled} aria-label={enabled ? t('switchDisable') : t('switchEnable')} disabled={op?.status === 'busy'} onClick={(e) => { e.stopPropagation(); applySetEnabled(skill) }}>
                            <span className="SKM_switchThumb" />
                          </button>
                        ) : null}
                        {editable ? (
                          <button type="button" className="SKM_deleteBtn" disabled={op?.status === 'busy'} onClick={(e) => { e.stopPropagation(); setDeleteConfirm(skill) }}>{t('deleteLabel')}</button>
                        ) : null}
                        {op?.status === 'error' ? <span className="SKM_opError">!</span> : null}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : null}
          <input ref={zipInput} className="SKM_fileInput" type="file" accept=".zip,application/zip,application/x-zip-compressed" onChange={onPickZip} />
          {detail !== null ? (
            <div className="SKM_detailOverlay" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) setDetail(null) }}>
              <div className="SKM_detailBox">
                <div className="SKM_detailHeader">
                  <span className="SKM_cardLeading"><IconSkillOutline16 size={16} /></span>
                  <h3 className="SKM_detailTitle">{detail.skill.name}</h3>
                  <button type="button" className="SKM_detailClose" onClick={() => setDetail(null)}>{t('retry') === 'Retry' ? 'Close' : '关闭'}</button>
                </div>
                <div className="SKM_detailBody">
                  {detail.body.status === 'loading' ? <p className="SKM_detailLoading">{t('contentLoading')}</p> : null}
                  {detail.body.status === 'error' ? <p className="SKM_detailError">{t('contentError')}</p> : null}
                  {detail.body.status === 'missing' ? <p className="SKM_detailError">{t('contentMissing')}</p> : null}
                  {detail.body.status === 'ready' && detail.body.content ? (
                    <DetailContent raw={detail.body.content.content} />
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
          {deleteConfirm !== null ? (
            <div className="SKM_detailOverlay" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) setDeleteConfirm(null) }}>
              <div className="SKM_confirmBox">
                <p className="SKM_confirmText">{t('deleteConfirm') + deleteConfirm.name + t('deleteConfirmSuffix')}</p>
                <div className="SKM_confirmActions">
                  <button type="button" className="SKM_confirmCancel" onClick={() => setDeleteConfirm(null)}>{t('retry') === 'Retry' ? 'Cancel' : '取消'}</button>
                  <button type="button" className="SKM_confirmDelete" disabled={ops[deleteConfirm.name]?.status === 'busy'} onClick={() => { const s = deleteConfirm; setDeleteConfirm(null); applyRemove(s) }}>{t('deleteLabel')}</button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
