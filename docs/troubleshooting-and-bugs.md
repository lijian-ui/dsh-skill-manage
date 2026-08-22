# dsh-skill-manage 踩坑记录与官方 Bug 分析

> 本文档记录在开发 `dsh-skill-manage` 插件过程中遇到的关键问题、踩坑经历、dsh 官方 Bug 发现过程及我们的解决方案。

---

## 目录

1. [项目背景](#1-项目背景)
2. [踩坑记录](#2-踩坑记录)
   - [2.1 插件客户端不能用 JSX / CSS Modules / lucide icons](#21-插件客户端不能用-jsx--css-modules--lucide-icons)
   - [2.2 SECTION_ID 不能与官方冲突](#22-section_id-不能与官方冲突)
   - [2.3 RPC 调用参数展开问题](#23-rpc-调用参数展开问题)
   - [2.4 构建产物同步机制](#24-构建产物同步机制)
   - [2.5 滑块按钮样式踩坑](#25-滑块按钮样式踩坑)
   - [2.6 删除确认弹窗不能用 window.confirm](#26-删除确认弹窗不能用-windowconfirm)
3. [dsh 官方 Bug：skill 开关后 / 命令补全不刷新](#3-dsh-官方-bugskill-开关后--命令补全不刷新)
   - [3.1 现象描述](#31-现象描述)
   - [3.2 调研过程](#32-调研过程)
   - [3.3 根因分析](#33-根因分析)
   - [3.4 为什么停用能"生效"而启用不能](#34-为什么停用能生效而启用不能)
   - [3.5 我们的解决方案](#35-我们的解决方案)
   - [3.6 延迟时间的讲究](#36-延迟时间的讲究)
4. [dsh 官方缺失功能：无 skill 开关控制](#4-dsh-官方缺失功能无-skill-开关控制)
5. [参考项目对比](#5-参考项目对比)
6. [经验总结](#6-经验总结)

---

## 1. 项目背景

`dsh-skill-manage` 是为 DeepSeek Harness (dsh) 桌面端开发的技能管理插件，提供以下功能：

- **技能列表**：按作用域（全局 / 工作区）分组展示所有技能
- **启用 / 停用**：通过滑块按钮热切换技能状态
- **删除技能**：永久删除技能文件（带确认弹窗）
- **添加技能**：从本地文件上传新技能
- **技能详情**：用 Markdown 渲染技能内容，展示 frontmatter 元数据
- **批量迁移**：在作用域之间复制或移动技能

插件参考了 `dsh-skill-viewer` 项目（仅有编译产物，无源码），从零重写了 host 端和 client 端代码。

### 技能文件约定

dsh 的技能是磁盘上的 `SKILL.md` 文件（或平铺的 `<name>.md` 文件）：

| 位置 | 路径 | 说明 |
|---|---|---|
| 全局 dsh | `~/.dsh/skills/<name>/SKILL.md` | 用户全局技能 |
| 全局 agents | `~/.agents/skills/<name>/SKILL.md` | agents 全局技能 |
| 工作区 | `<workspace>/.dsh/skills/<name>/SKILL.md` | 项目级技能 |
| 内置 | `DSH_BUNDLED_SKILL_DIR` | 随部署附带，不可修改 |

停用机制：将 `SKILL.md` 重命名为 `SKILL.md.disabled`，dsh 官方 provider 只识别 `.md` 结尾的文件，`.disabled` 文件会被忽略，从而实现"停用"。

---

## 2. 踩坑记录

### 2.1 插件客户端不能用 JSX / CSS Modules / lucide icons

**现象**：最初按照 dsh 插件开发规范，client 端不能用 JSX、不能用 CSS Modules、不能用 lucide icons，需要用 `createElement`、inline styles 或 CSS 字符串注入、inline SVG。

**实际情况**：`SkillManageSection.tsx` 使用了 JSX（`.tsx` 文件），通过 tsdown 编译后正常工作。CSS 通过 `CSS_TEXT` 字符串注入 `<style>` 标签。图标使用 inline SVG。

**结论**：JSX 在 client 端可用（tsdown 会编译为 `createElement` 调用），但需要确保构建配置正确。CSS Modules 确实不可用，改用 CSS 字符串注入。lucide icons 不可用，改用 inline SVG 和 `@deepseek-ai/dsh-client-ui-primitives` 导出的图标组件。

### 2.2 SECTION_ID 不能与官方冲突

**现象**：最初将 SECTION_ID 设为 `'skills'`，与 dsh 官方的 skill 相关 section 冲突，导致设置页无法正常显示。

**解决**：将 SECTION_ID 改为 `'skill-manage'`，避免与官方冲突。

**代码位置**：`src/client/index.ts:6`

```typescript
const SECTION_ID = 'skill-manage'  // 不能是 'skills'，会与官方冲突
```

### 2.3 RPC 调用参数展开问题

**现象**：client 端调用 host 端 RPC 方法时，参数传递不正确，导致 host 端收到的参数是 `[args]` 而不是展开的 `arg1, arg2, ...`。

**解决**：`callRemote` 必须用 `remote[method](...args)` 展开传参，而不是 `remote[method](args)`。

**代码位置**：`src/client/index.ts:128-134`

```typescript
const callRemote = async (method: string, ...args: unknown[]): Promise<unknown> => {
  await mount
  const remote = (ctx as unknown as RemoteCtx).get(`remote.${SERVICE}`)
  const result = await remote[method](...args)  // 必须展开传参
  if (!result.ok) throw new Error(...)
  return result.value
}
```

### 2.4 构建产物同步机制

**现象**：修改插件代码后，`npx tsdown` 构建成功，但桌面端没有加载新代码。

**原因**：构建产物在 `extensions/dsh-skill-manage/lib/` 下，需要通过 junction 链接到 `node_modules/@lijian-ui/dsh-skill-manage`。junction 自动同步，但桌面端需要重启才能加载新 bundle。

**解决**：每次构建后需要重启桌面端（`npm run dev`）。

### 2.5 滑块按钮样式踩坑

**现象**：滑块按钮样式不一致，关闭时轨道颜色不对，thumb 位置不准确。

**解决**：参考 `im-gateway` 插件的滑块样式，用 CSS 类实现：

- 关闭时：轨道 `border-l2` 灰色
- 开启时：`business-primary` 蓝色
- thumb 始终白色 `#fff` + 阴影
- 用 `left` 切换位置（2px ↔ 17px）
- 尺寸 36×21

**代码位置**：`src/client/SkillManageSection.tsx` 中的 `CSS_TEXT` 和 `SKM_switch` 类。

### 2.6 删除确认弹窗不能用 window.confirm

**现象**：`window.confirm()` 在 dsh 桌面端中可能被拦截或样式不统一。

**解决**：自定义确认弹窗组件，替代 `window.confirm()`。弹窗包含确认和取消按钮，样式与设置页一致。

---

## 3. dsh 官方 Bug：skill 开关后 / 命令补全不刷新

### 3.1 现象描述

在 dsh 桌面端的设置页中，通过滑块按钮**启用**一个已停用的技能后，回到聊天页面输入 `/`，斜杠命令补全菜单中**不显示**刚启用的技能。需要重载页面或开启新会话才能恢复。

**注意**：**停用**技能则能立即"生效"——AI 模型不再调用该技能。

### 3.2 调研过程

#### 第一步：确认 host 端逻辑正确

通过在 `setEnabled` 中添加调试日志，确认：

- 停用时：`locatedKind: 'live'` → `rename(SKILL.md, SKILL.md.disabled)` ✓
- 启用时：`locatedKind: 'file'`, `locatedFile: 'SKILL.md.disabled'` → `rename(SKILL.md.disabled, SKILL.md)` ✓
- 文件重命名成功，dsh 的 chokidar 文件监听器检测到变化

**结论**：host 端逻辑完全正确，与参考项目 `dsh-skill-viewer` 一致。

#### 第二步：分析 chokidar 文件监听机制

`FileSystemSkillProvider` 使用 chokidar 监听技能目录：

```javascript
// node_modules/@deepseek-ai/dsh-skill-filesystem/lib/index.js:372
const watcher = chokidar.watch(mode.anchor, {
  persistent: true,
  ignoreInitial: true,
  depth: 1,
  atomic: true,
  awaitWriteFinish: {
    stabilityThreshold: 200,  // DEFAULT_WATCH_STABILITY_THRESHOLD_MS
    pollInterval: 100          // DEFAULT_WATCH_POLL_INTERVAL_MS
  }
});
```

`isRelevantWatchEvent` 过滤逻辑（`index.js:541-551`）：

```javascript
function isRelevantWatchEvent(root, event, path) {
  const segments = containedSegments(root.path, path);
  if (segments === void 0) return false;
  if (segments.length === 0) return event === "addDir" || event === "unlinkDir";
  if (segments.length === 1) {
    if (event === "addDir" || event === "unlinkDir") return true;
    return segments[0]?.endsWith(".md") === true;
  }
  // segments.length === 2：目录型技能 agnes-image/SKILL.md
  return segments.length === 2 && segments[1] === "SKILL.md" && event !== "addDir" && event !== "unlinkDir";
}
```

- 停用时：`unlink SKILL.md` → `segments[1] === "SKILL.md"` → 相关 → `invalidate()` ✓
- 启用时：`add SKILL.md` → `segments[1] === "SKILL.md"` → 相关 → `invalidate()` ✓

**结论**：chokidar 监听和 registry 失效机制工作正常，无论停用还是启用，registry 缓存都会被正确失效。

#### 第三步：追踪 / 命令补全的完整链路

通过深入调查 dsh client 端代码，发现存在**三层缓存**：

| 层级 | 位置 | 缓存载体 | 失效方式 |
|---|---|---|---|
| L1 host registry | `dsh-skill/lib/index.js:376` | `collectCache: Map` | `invalidateCache()` → `revision++` + `clear()` + `notifyChange()` |
| L2 client ui-skill | `dsh-client-ui-skill/lib/client.js:245` | `fetches: Map<sessionId, {promise, abort}>` | 仅由 `agent-preset/selected` 和 `connection/reset` 触发 |
| L3 input-trigger | `dsh-client-ui-input-trigger/lib/client.js:501` | lexicon snapshot | 依赖 L2 的 `notifyLexicon` |

#### 第四步：发现根因

`/` 命令补全获取技能列表的路径：

```
用户输入 / → InputTriggerController.fetchCandidates
  → source.candidates (dsh-client-ui-skill 注册)
  → fetchCatalog(sessionId)
  → 命中 fetches Map 缓存 → 返回旧 promise → 不重新查询
```

`fetchCatalog` 的关键代码（`dsh-client-ui-skill/lib/client.js:243-265`）：

```javascript
const fetchCatalog = (sessionId) => {
  const existing = fetches.get(sessionId);
  if (existing !== void 0) return existing.promise;  // ← 罪魁祸首：命中即返回旧 promise
  // ... 首次才发起 RPC
};
```

L2 缓存的失效绑定（`client.js:310-311`）：

```javascript
ctx.remote.$on("agent-preset/selected", invalidate);  // 切换 agent preset 时失效
ctx.on("connection/reset", clearAll);                   // 连接重置时失效
```

**关键发现**：host 端 registry 失效时会派发 `skills/change` 事件（`dsh-skill/lib/index.js:403-412`），但 **client 端的 `dsh-client-ui-skill` 没有订阅 `skills/change` 事件**！

全局搜索 `skills/change` 仅两处命中：
- `dsh-skill/lib/index.js:404` — 派发
- `dsh-tool-cordis/lib/index.js:3789` — 事件签名声明

**没有任何 `ctx.on("skills/change", ...)` 或 `ctx.remote.$on("skills/change", ...)` 订阅点。**

#### 对比佐证

同项目的 `dsh-client-ui-commands` 包正确订阅了 `commands/change` 来失效命令目录缓存：

```javascript
// dsh-client-ui-commands/lib/client.js:528-530
ctx.remote.$on("commands/change", () => {
  this.directory.invalidateAll();
});
```

`dsh-client-ui-skill` 漏掉了对等的 `skills/change` 订阅。**这是 dsh 官方的 Bug。**

### 3.3 根因分析

```
启用技能 → host rename(SKILL.md.disabled → SKILL.md)
  → chokidar 检测到 add SKILL.md
  → isRelevantWatchEvent 判断为相关
  → queueInvalidation() → invalidateCache()
  → revision++ + collectCache.clear() + notifyChange()
  → 派发 skills/change 事件
  → 但 client 端无人订阅 skills/change  ✗
  → fetches Map 缓存未清除
  → / 补全命中旧 promise → 返回旧技能列表 → 不显示新启用的技能
```

### 3.4 为什么停用能"生效"而启用不能

这是一个关键的认知点。停用和启用在 client 端 `fetches` Map 缓存层面的行为其实**相同**——都不刷新。但效果不同：

**停用 = "减法"操作**（技能从列表中消失）：
- host 端 registry 失效后，**AI 模型**下次获取技能列表时拿不到该技能 → 不再调用 ✓
- 即使 `/` 补全仍缓存旧数据（还显示该技能），用户手动选中后调用也会**失败**（registry 中已不存在）
- "生效"由 **host 端 registry** 控制，不需要 client 缓存刷新

**启用 = "加法"操作**（技能出现在列表中）：
- host 端 registry 失效后，AI 模型可以调用 ✓
- 但 `/` 补全需要**显示新技能** → 依赖 client 端 `fetches` Map → 缓存未清除 → 不显示 ✗
- "生效"依赖 **client 端缓存**，而缓存没刷新

**本质**：停用的效果是"消失"——host 端 registry 删了就够了，client 缓存里多一个没用的条目不影响体验。启用的效果是"出现"——必须 client 缓存刷新才能看到，而 `dsh-client-ui-skill` 漏了 `skills/change` 订阅导致缓存不刷新。

### 3.5 我们的解决方案

**原则**：不动 dsh 官方代码，等官方修复。

**方案**：在插件 client 端的 `reloadAfterHot` 中，延迟 800ms 后调用 `ctx.emit('connection/reset')`，触发所有模块静默刷新缓存。

**实现**：

`src/client/index.ts`：
```typescript
type EmitCtx = { emit(event: string): void }

// 在 inject 中传递：
refreshSkillCache: () => (ctx as unknown as EmitCtx).emit('connection/reset'),
```

`src/client/SkillManageSection.tsx`：
```typescript
const reloadAfterHot = (): void => {
  setTimeout(() => {
    refreshSkillCache()       // 触发 connection/reset，清除 client 端所有缓存
    setRequest((value) => value + 1)  // 刷新设置页列表
  }, 800)
}
```

**`connection/reset` 事件的影响**：

`connection/reset` 有 10+ 个监听器，但都是"刷新"操作（`controller.load()`、`refresh()`），不会导致聊天记录消失或 sessions 清空：

| 监听器 | 行为 | 副作用 |
|---|---|---|
| `dsh-client-ui-skill` | `clearAll()` — 清除技能缓存 | ✓ 正是我们想要的 |
| `dsh-client-ui-commands` | `resetConnected()` — 重置命令缓存 | 轻微，命令列表重新加载 |
| `dsh-client-ui-cordis` | `inventory.reset() + refresh()` | 轻微，cordis 列表重新加载 |
| `dsh-client-ui-model-selection` | `resetConnected()` | 轻微，模型列表重新加载 |
| `dsh-client-ui-settings-*` | `refresh()` | 轻微，设置数据重新加载 |
| 其他 | 各种 `refresh()` / `reset()` | 轻微 |

用户在设置页中操作，不会感知到聊天界面的缓存刷新。

### 3.6 延迟时间的讲究

延迟 800ms 不是随意选择的，需要满足时序竞争条件：

```
1. host rename 文件
2. chokidar 检测到变化（有 awaitWriteFinish 延迟）
3. registry 缓存失效（revision++）
4. ctx.emit('connection/reset') → client fetches Map 清除
5. / 补全 → RPC skills.list → host registry 返回最新数据
```

**如果步骤 4 在步骤 3 之前发生**：client 缓存清除了，但 host registry 还没失效 → `skills.list` 返回旧数据 → client 重新缓存旧 promise → `/` 补全还是旧的 ❌

chokidar 检测延迟的组成：

| 因素 | 延迟 |
|---|---|
| 操作系统文件通知 | 通常 < 50ms |
| `awaitWriteFinish.stabilityThreshold` | 200ms |
| `awaitWriteFinish.pollInterval` | 100ms（一两次轮询） |
| **总计** | **约 200-300ms** |

- **450ms**（参考项目 `dsh-skill-viewer` 的延迟）：够用，但比较紧
- **800ms**（我们的延迟）：安全余量约 500ms，覆盖高负载机器或慢磁盘场景
- **1000ms**（初始选择）：更保守，但用户等待稍久

不能太短（< 300ms 可能赶不上 chokidar），也不能太长（用户等太久才生效）。800ms 是个合理的选择。

---

## 4. dsh 官方缺失功能：无 skill 开关控制

在调查过程中，我们全面调研了 dsh 官方是否有 skill 启用/停用控制功能：

| 调查项 | 结果 |
|---|---|
| CLI 命令（`dsh skill enable/disable`） | 无 |
| 设置页 UI | 无（只有 plugin 层面的 enabled/disabled，无 skill 层面） |
| Slash 命令（`/skill`） | 无（`/` 菜单只用于调用技能，不管理） |
| 配置文件字段 | 无（无 `disabledSkills`/`enabledSkills`） |
| API 方法 | 无（registry 只有 `register/list/get/snapshot`，无 `setEnabled`） |
| `.disabled` 文件机制 | 无（官方只识别 `.md` 结尾和 `SKILL.md`，不识别 `.disabled` 后缀） |

**官方唯一的"控制"**：SKILL.md frontmatter 的 `disable-model-invocation: true` 和 `user-invocable: false` 两个静态字段，需手动编辑文件，且 skill 仍被发现加载，只是从特定接口隐藏——不是真正的"停用"。

**结论**：`dsh-skill-manage` 插件填补了 dsh 官方的空白。`.disabled` 文件重命名机制是参考项目 `dsh-skill-viewer` 首创、我们继承的方案。

---

## 5. 参考项目对比

参考项目 `dsh-skill-viewer` 位于 `E:\Project\dsh-desktop\参考项目\dsh-skill-viewer\`，只有编译产物（`lib/`），无源码。

| 对比项 | dsh-skill-viewer | dsh-skill-manage |
|---|---|---|
| 源码 | 无（仅编译产物） | 有（TypeScript 源码） |
| `setEnabled` host 端 | `lib/index.js:454` | `src/remote.ts:471`（逻辑一致） |
| `applySetEnabled` client 端 | `lib/client.js:609` | `src/client/SkillManageSection.tsx:470`（逻辑一致） |
| `reloadAfterHot` 延迟 | 450ms | 800ms |
| 缓存刷新 | 无（同样不触发 `connection/reset`） | 有（`ctx.emit('connection/reset')`） |
| 删除确认 | `window.confirm()` | 自定义确认弹窗 |
| 滑块样式 | 未知（编译产物） | 参考 im-gateway 实现 |
| Markdown 渲染 | 未知 | 使用 `MarkdownText` 组件 |
| SECTION_ID | `'skills'`（可能与官方冲突） | `'skill-manage'`（避免冲突） |

**关键区别**：`dsh-skill-viewer` 同样存在启用后 `/` 补全不刷新的问题（因为也是用 `reloadAfterHot` 只刷新设置页列表），但参考项目没有解决此问题。我们的 `dsh-skill-manage` 通过 `ctx.emit('connection/reset')` 解决了这个问题。

---

## 6. 经验总结

### 6.1 dsh 插件开发要点

1. **SECTION_ID 避免冲突**：不要使用与官方 section 相同的 ID
2. **RPC 参数展开**：`callRemote` 必须用 `remote[method](...args)` 展开传参
3. **构建后需重启**：`npx tsdown` 构建后需要重启桌面端才能加载新 bundle
4. **CSS 用字符串注入**：不能用 CSS Modules，用 `CSS_TEXT` 字符串注入 `<style>` 标签
5. **图标用 inline SVG**：不能用 lucide icons，用 inline SVG 或 `dsh-client-ui-primitives` 导出的图标

### 6.2 dsh 缓存体系

dsh 的技能列表有**三层缓存**：

1. **L1 host registry**：`collectCache` 按 revision 缓存，chokidar watcher 检测到文件变化时自动失效
2. **L2 client ui-skill**：`fetches` Map 按 sessionId 缓存，只在 `agent-preset/selected` 和 `connection/reset` 时失效
3. **L3 input-trigger**：lexicon snapshot，依赖 L2 的 `notifyLexicon`

**关键认知**：L1 的失效是自动的（chokidar），但 L2 的失效需要事件触发。dsh 官方漏掉了 `skills/change` 事件的订阅，导致 L2 缓存不会在技能文件变化时自动失效。

### 6.3 "减法"vs"加法"操作的区别

在缓存不刷新的情况下：
- **"减法"操作**（删除/停用）：host 端生效即可，client 缓存中多出的旧条目不影响体验
- **"加法"操作**（添加/启用）：必须 client 缓存刷新才能看到新条目

这个认知对排查类似问题很有帮助。

### 6.4 不动官方代码的 workaround

当发现官方包有 Bug 但不想修改官方代码时，可以寻找**官方提供的事件机制**来间接触发缓存刷新：

- `ctx.emit('connection/reset')` — 触发所有模块重新加载缓存
- `ctx.remote.$dispatch(event, args)` — 派发 remote 事件触发监听器

这些是 dsh 框架提供的合法 API，使用它们不算"修改官方代码"。

---

*文档最后更新：2026-08-22*