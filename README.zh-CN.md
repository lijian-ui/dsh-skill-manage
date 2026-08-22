# dsh-skill-manage · 技能管理插件

[English](./README.md) | **中文**

> 为 DeepSeek Harness (dsh) 桌面端提供技能管理功能：列表 / 启用 / 停用 / 删除 / 添加 / 迁移，填补 dsh 官方在 skill 开关控制方面的空白。

## 功能概览

| 功能 | 说明 |
|---|---|
| 技能列表 | 按作用域（全局 / 工作区）分组展示所有技能，支持搜索 |
| 启用 / 停用 | 滑块按钮热切换，无需重启即可生效 |
| 删除技能 | 永久删除技能文件，带自定义确认弹窗 |
| 添加技能 | 从本地文件上传新技能（目录束或单文件） |
| 技能详情 | Markdown 渲染技能内容，展示 frontmatter 元数据表格 |
| 批量迁移 | 在全局 / 工作区作用域之间复制或移动技能 |

## 背景

dsh 官方目前**没有** skill 启用/停用控制功能——无 CLI 命令、无设置页 UI、无 slash 命令、无配置文件字段、无 API 方法。官方仅提供 frontmatter 的 `disable-model-invocation` 和 `user-invocable` 两个静态字段，需手动编辑文件，且 skill 仍被发现加载，只是从特定接口隐藏。

本插件通过 `.disabled` 文件重命名机制实现真正的开关控制：将 `SKILL.md` 重命名为 `SKILL.md.disabled`，dsh 官方 provider 只识别 `.md` 结尾的文件，`.disabled` 文件会被忽略，从而实现"停用"。

## 安装

### 前置条件

- DeepSeek Harness (dsh) 桌面端
- Node.js >= 18

### 在 dsh-desktop 项目中集成

1. 将插件添加为项目依赖：

```bash
npm install @lijian-ui/dsh-skill-manage
```

2. 在 dsh 桌面端的插件注册配置中添加本插件（通常在 `src/main/profile-init.ts` 中）。

3. 重启桌面端。

### 本地开发

```bash
# 进入插件目录
cd extensions/dsh-skill-manage

# 安装依赖
npm install

# 构建
npm run build

# 监听模式
npm run watch

# 类型检查
npm run typecheck
```

构建产物在 `lib/` 目录下，通过 junction 自动同步到 `node_modules/@lijian-ui/dsh-skill-manage`。每次构建后需重启桌面端加载新 bundle。

## 使用方式

1. 打开 dsh 桌面端
2. 进入 **设置** → **技能管理**
3. 在技能列表中：
   - 点击滑块按钮启用/停用技能
   - 点击删除按钮永久删除技能
   - 点击技能卡片查看详情
   - 使用搜索框过滤技能
   - 点击"添加技能"上传新技能
   - 点击"批量迁移"在作用域之间移动技能

### 技能文件约定

| 状态 | 目录型技能 | 平铺型技能 |
|---|---|---|
| 启用 | `<name>/SKILL.md` | `<name>.md` |
| 停用 | `<name>/SKILL.md.disabled` | `<name>.md.disabled` |

### 技能作用域

| 作用域 | 路径 | 说明 |
|---|---|---|
| 全局 dsh | `~/.dsh/skills/` | 用户全局技能 |
| 全局 agents | `~/.agents/skills/` | agents 全局技能 |
| 工作区 | `<workspace>/.dsh/skills/` | 项目级技能 |
| 内置 | `DSH_BUNDLED_SKILL_DIR` | 随部署附带，不可修改 |

## 技术架构

### 目录结构

```
extensions/dsh-skill-manage/
├── src/
│   ├── index.ts                    # Host 端入口
│   ├── remote.ts                   # Host 端 RPC 方法（list/setEnabled/deleteSkill/migrate 等）
│   ├── skill-files.ts              # 文件约定（DISABLED_SUFFIX、collectSkillEntries）
│   ├── scope.ts                    # 迁移引擎
│   └── client/
│       ├── index.ts                # Client 端入口（SECTION_ID、RPC 注册、inject）
│       ├── SkillManageSection.tsx  # 主设置页组件（卡片列表 + 滑块 + 详情弹窗）
│       └── client-i18n.ts         # 客户端国际化（中/英）
├── lib/                            # 构建产物
├── docs/
│   └── troubleshooting-and-bugs.md # 踩坑记录与官方 Bug 分析
├── package.json
└── tsdown.config.ts
```

### Host 端（`src/remote.ts`）

提供以下 RPC 方法：

| 方法 | 功能 |
|---|---|
| `list(sessionId)` | 列出所有技能（含启用状态） |
| `content(name, sessionId)` | 获取技能完整内容 |
| `setEnabled(name, sessionId, enabled)` | 启用/停用技能（文件重命名） |
| `deleteSkill(name, sessionId)` | 删除技能 |
| `addSkill(sessionId, payload)` | 添加新技能 |
| `workspaces()` | 列出可用工作区 |
| `migrate(name, sessionId, payload)` | 迁移单个技能 |
| `batchMigrate(sessionId, payload)` | 批量迁移技能 |

### Client 端（`src/client/`）

- **`index.ts`**：注册设置页 section，通过 `ctx.slots.inject` 注入到 dsh 设置面板
- **`SkillManageSection.tsx`**：React 组件，渲染技能卡片列表、滑块按钮、详情弹窗、删除确认弹窗、迁移弹窗
- **`client-i18n.ts`**：中英文翻译

### 开关机制

```
用户点击滑块
  → client 乐观更新 UI（立即切换开关状态）
  → RPC 调用 host 端 setEnabled
  → host: rename(SKILL.md ↔ SKILL.md.disabled)
  → dsh chokidar watcher 检测到文件变化
  → registry 缓存失效（revision++）
  → 延迟 800ms 后 ctx.emit('connection/reset')
  → client 端 fetches Map 清除
  → 下次 / 补全重新查询 → 获取最新技能列表
```

## 已知问题与解决方案

### 启用技能后 / 命令补全不刷新

**问题**：启用技能后，聊天页面的 `/` 斜杠命令补全不显示新启用的技能。

**根因**：dsh 官方包 `dsh-client-ui-skill` 漏订阅了 `skills/change` 事件，导致 client 端技能列表缓存不会在技能文件变化时自动失效。

**我们的解决**：在 `reloadAfterHot` 中延迟 800ms 后调用 `ctx.emit('connection/reset')`，触发所有模块静默刷新缓存。用户在设置页中操作，不会感知到聊天界面的缓存刷新。

详见 [踩坑记录与官方 Bug 分析](./docs/troubleshooting-and-bugs.md)。

## 国际化

支持中文和英文两种语言，翻译文件在 `src/client/client-i18n.ts` 中。语言切换跟随 dsh 桌面端的语言设置。

## 技术栈

- **语言**：TypeScript
- **构建**：tsdown (rolldown)
- **前端**：React 18
- **Markdown 渲染**：`@deepseek-ai/dsh-client-ui-primitives` 的 `MarkdownText` 组件
- **YAML 解析**：yaml (frontmatter 解析)
- **文件监听**：dsh 官方的 chokidar watcher（自动检测技能文件变化）

## 许可证

MIT

## 相关链接

- [踩坑记录与官方 Bug 分析](./docs/troubleshooting-and-bugs.md)
- [DeepSeek Harness (dsh)](https://github.com/deepseek-ai/dsh)