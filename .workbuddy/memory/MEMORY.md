# 项目长期记忆：dsh-skill-manage

## dsh typert 契约割裂（关键坑）
- 官方 monorepo 源码（`@deepseek-ai/dsh-typert-*`）：codec 用 `create: () => TypertSchema`（`types.ts` 的 `TypertCodec` 仅此字段）；`validateCodec` 检查 `codec.create` 是否为函数。
- npm 发布版 0.1.6-alpha.1（dsh-desktop 0.5.0 实际安装）：codec 用 `schema: { parse }`；`dsh-typert-registry` 检查 `codec.schema.parse`，网关执行 `codec.schema.parse(value)`。**同名不同实现。**
- 含义：写成 `create` 就只能在升级后的 dsh 运行时跑；写成 `schema` 只能跑旧版。对齐官方 = 升 dsh 运行时。

## 项目方向（2026-09-23 明确）
- 用户已**停止开发 dsh-desktop**，只专注 `@lijian-ui/dsh-skill-manage` 插件本身。
- 插件目标运行时 = 官方 monorepo 新源码（typert `create` 契约），**不再需要兼容旧 npm 发布版 0.1.6-alpha.1 / dsh-desktop 0.5.0**。
- 因此「纯对齐官方 create」是正确方向，无需保留 `schema` 兼容分支。

## 第三方 dsh 插件依赖惯例（对齐用，已核实桌面版硬校验）
- **所有 `@deepseek-ai/*`（含 `cordis`、`schemastery`、全部 `dsh-*`）必须放 `peerDependencies`，不能放 `dependencies`**。依据：桌面版 `apps/desktop/src/profile-packages.ts` 的 `validateDesktopPluginGraph`——宿主 shared package 出现在插件 `dependencies` 时直接报 `must declare X as a peer dependency`，装不进桌面版；放 peer 时用 `satisfies(hostDshVersion, range)` 校验，不要求精确锁。
- peer 用**范围**可做成通用版：dsh 0.1.x 包用 `^0.1.0`（覆盖整个 0.1.x 且自动排斥 0.2.0 破坏性大版本）；`cordis` 用 `^4.0.0`；`schemastery` 版本线 3.x 用 `^3.18.0`。**不要**写 `^0.1.6-alpha.1`（semver 下只匹配 `<0.1.7-0` 预发布，不匹配未来 stable）。
- `devDependencies` 里**保留一份**这些 `@deepseek-ai/*` 的精确版供本地 `tsc`/`tsdown` 编译 resolve 类型；真正的第三方依赖（fflate/yaml/zod/IM SDK）放 `dependencies`。
- host 面类型 `TypertRegistry` / `TypertContribution` 来自 `@deepseek-ai/dsh-typert-registry`；client 面 `TypertRemoteContribution` 来自 `@deepseek-ai/dsh-typert-protocol`。
- `cordis.patch.yml` 标准写法：`- insert: [{ id, name }]`，多余 `config: {}` 删掉。
- 早期"client 包放 devDeps"是 monorepo 第一方插件写法；独立第三方插件要装进官方桌面版必须用 peer + 范围。

## cordis `inject` 是硬依赖（关键坑，2026-09-23）
- 插件导出的 `export const inject = [...]` 里声明的服务，**只要运行 profile 里有一个不存在，整个 `apply` 就被 cordis 永久挂起、永不执行**。症状极具迷惑性：客户端半边（有自己的 inject 列表）能加载、UI 入口照常出现，但 host 半边没跑 → typert MANIFEST 没注册 → 客户端调 `remote.<ns>` 失败 → UI 报「暂时无法读取技能」之类。
- **规则：第三方插件的顶层 `inject` 只放"确定每个目标 profile 都有"的服务**。参考可用插件 `dsh-im-gateway` host 只 inject `['typert', 'settings']`。
- 其余服务一律：**读取用防御式 `ctx.get('x')` + 空值判断**；**需要等待就绪的用 `ctx.inject(['x'], cb)` 惰性注册**（如 `tools` 服务的工具注册），不要放进顶层 inject。
- **`inject` 与 `ctx.<service>` 是配套的，摘了 inject 就必须改读取方式（关键坑，2026-09-23）**：cordis 把服务声明成 `ctx` 上的 getter，**只有列在 `inject` 里的服务才允许 `ctx.skills` 这种直连属性访问**；否则 getter 主动抛 `cannot get property "skills" without inject`（经 typert 网关包装后表现为 RPC 失败：`skillManage.list failed: gateway/internal: cannot get property "skills" without inject`）。
  - **规则：只要服务不在 `inject`，全仓库统一用 `ctx.get('skills')` 读取**（`ctx.get` 不受守卫限制，缺失返回 `undefined`）。摘 inject 时务必同时 grep `ctx.<name>` / `(ctx as Context & {...}).<name>` 全部改成 `ctx.get`。
  - 排查口诀：`cannot get property "X" without inject` = 代码里直连了 `ctx.X` 但 `X` 不在 inject 里。**不是服务不存在**（`ctx.get('X')` 明明能拿到），而是"没声明就不给直接点属性"。
- 排查手法：在 `index.ts` 模块顶层（import 即执行，早于 inject 解析）打一行 log；再在 `apply` 开头打一行 log 并打印各服务 `ctx.get(...) !== undefined`。若只见前者不见后者 → 就是 inject 挂起。

## 客户端「当前会话」的正确读法（关键坑，2026-09-23）
- 客户端 `ctx.get('sessions')`（= `ISessions`，类型来自 `@deepseek-ai/dsh-api-session-controller/client`）**没有 `currentProvideInfo` 这个属性**。写错会抛 `Cannot read properties of undefined (reading 'getSnapshot')`，UI 面板显示「暂时无法读取技能」，但 host 侧日志一切正常——极具迷惑性。
- 正确读法（官方 `ui-session` 内部与官方 `ui-skill` 客户端同款）：`ctx.get('sessions').list.getSnapshot().current` → `SessionListState.current: SessionId | undefined`。同族 API：`.list.getSnapshot().byId[id].cwd`、`sessions.subagentAddress(id)`、`sessions.open(id)`。
- 规范做法（官方"标准属性"）：**root 域槽位**（如 `settings.section`，`scope: 'root'`）的组件会自动收到 `GlobalStandardProps`，其中 `useSessions` 是选择器 hook（`props.useSessions(state => state)` → `{ current, byId, phase }`）。官方 `ui-settings-unarchive-sessions` 就是这么拿会话的。session 域槽位另有 `sessionId` / `useSession` / `useProjection`，由 `SessionStandardProps` 合并进来。
- 会话 id 对「列全局技能」并非必需：拿不到就传 `undefined`，host 侧回退全局层（含 `~/.dsh/skills`）。**任何客户端取会话的代码都必须 try-catch + 可选链**，绝不能让"没有当前会话"变成"列表读不出来"。

## 排查手法：文件日志 + 面板透出错误（2026-09-23 加装）
- host 侧 `src/debug.ts` 把日志写到 `%USERPROFILE%\.dsh\skill-manage-debug.log` 并同时打印到 dsh 控制台。判据：只见 `[boot] host module imported` 而无 `[apply] host apply running` → inject 挂起；出现 `[register] typert manifest registered` + `[tools] skill tool registered` → host 侧全通，问题在客户端。
- 客户端面板错误区显示真实 `err.message`（`ListStateError.message`），用户不开控制台也能截到根因。
- 结论：这套"host 文件日志 + 客户端错误透出"对定位跨半边问题极有效，值得保留到稳定后再精简。

## 本机构建/发布环境注意事项
- Git Bash（Bash 工具）在本机 PATH 残缺且会触发 wsl 拦截；npm 相关一律走 PowerShell，输出用 `2>&1 | Out-File -Encoding ascii` 落盘再 Read（UTF-16/二进制会读不出来）。
- `cmd /c` 在 PowerShell 里被禁用；`Start-Process -RedirectStandardOutput` 抓不到 npm 输出。
- **`npm publish` 在本机可能出现"假失败"**：首次 PUT 其实已成功但退出码非 0，重试报 `E403 You cannot publish over the previously published versions` —— 见到 E403 即说明该版本**已发布成功**，改用 `npm view <pkg>@<ver> version dist.tarball` 复核即可。
- 发布需显式 `--registry https://registry.npmjs.org/`（全局 `.npmrc` 指向 npmmirror 镜像）。
- 本机 `node_modules` 常缺失；装依赖用 `npm install --legacy-peer-deps`。
- **本机 `Remove-Item` 传多个逗号分隔路径时可能只删掉第一个就静默中止**（`-ErrorAction SilentlyContinue` 会吞掉原因），且 PowerShell 工具的 stdout 常不显示——**清理文件必须逐个删 + 用 `Test-Path` 复核 + 把结果写进文件再 Read**，否则会出现"以为删干净了、其实还在"的假象（本项目曾因此留下 40 多个临时日志）。

## 官方客户端 UI 组件可直接用（平台种子模块，2026-09-23 核实）
- **`@deepseek-ai/dsh-client-ui-primitives` 是 web/桌面客户端的「平台种子模块」**，永远在模块表里可用，第三方插件可直接 `import { Switch, Button, IconXXX16, MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'`，无需自己实现样式。
- 依据：`packages/client/web/src/platform.ts` 的 `PLATFORM_MODULES` 常量列出全部种子词（`react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`、`@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/dsh-client-ui-dockkit`）；`packages/client/web/src/seed.ts` 的 `getStaticModules()` 静态 import 这些包并放进冻结模块表（`satisfies Record<PlatformModule, unknown>` 双端编译期对齐）。
- 结论：**只有这 9 个 specifier 在客户端能安全 `import`**（加自己的 CSS/图标），其余一律要内联进自己的 client bundle（tsdown 的 `noExternal` 返回 `true`）。注意 `@deepseek-ai/dsh-client-ui-attachment` **不在**种子表里——tsdown 里把它列 external 但若真 import 会 `require` miss。
- 官方 `Switch` 用法：`<Switch checked onChange={(next)=>…} label={稳定名词} disabled? title? className? />`。**`label` 必须是"不随状态变化的固定名词"**（如技能名、设置项名、`t('showPicker')`），不要用会翻转的"启用/停用"——官方 `AgentPresetSection` / `SubagentModelSelectionCard` 都是固定名词；视觉状态由组件内部按 `aria-checked` 驱动（不用传 data-on）。
- 客户端 bundle 的 externals 白名单要与 `PLATFORM_MODULES` 保持一致（我们的 `tsdown.config.ts` 已含 ui-slots + ui-primitives）。

## Web 版 vs 桌面版插件集成（关键认知）
- **插件代码通用**（host/client 两面、typert `create` 契约、React 面板）；差异只在装载/分发方式。
- Web：随 `dsh-web-app` 构建（`cordis.patch.yml` 的 `- insert` 包养）或 profile overlay patch。
- 桌面版：独立 npm 包，运行时 `pluginsAdd` → pnpm `--save-exact` 装进 profile、追加 `dsh.profile.bundles`；`desktop-host` 的 `desktopComposition` 读 `dsh.profile.bundles` 拼装每个包的 `dsh.bundle.patch`。
- 桌面版硬约束：① `dsh.bundle.patch` 强制（缺则拒绝）；② profile 层插件引用精确版本（`--save-exact`，不强制插件自身 deps 锁死）；③ runtimeId 版本锁（插件须对齐桌面 app 的 dsh 版本）。
- 桌面版 profile 永远以 `@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-web-app` 打头 → 客户端运行时与 Web 同套。
- 跨平台插件写法：自带 `dsh.bundle.patch` + `dsh.client.*` + 自插入 patch（`name`=本包名）+ `create` 契约。参考插件已满足。
