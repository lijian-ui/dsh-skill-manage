# dsh-skill-manage · Skill Management Plugin

**English** | [中文](./README.zh-CN.md)

> A skill management plugin for DeepSeek Harness (dsh) desktop: list / enable / disable / delete / add skills, filling the gap in dsh's official skill toggle control.

## Features

| Feature | Description |
|---|---|
| Skill List | Display all skills grouped by scope (global / workspace), with search |
| Enable / Disable | Toggle switch for hot enable/disable, no restart required |
| Delete Skill | Permanently remove skill files with a custom confirmation dialog |
| Add Skill | Pick a .zip archive and auto-extract it into the global skills directory (~/.dsh/skills) |
| Skill Details | Render skill content as Markdown, display frontmatter metadata table |

## Background

dsh officially has **no** skill enable/disable control — no CLI command, no settings UI, no slash command, no config file field, no API method. The only official "control" is via frontmatter fields `disable-model-invocation` and `user-invocable`, which require manual file editing and don't truly disable the skill (it's still discovered and loaded, just hidden from certain interfaces).

This plugin implements true toggle control via a `.disabled` file rename mechanism: renaming `SKILL.md` to `SKILL.md.disabled` causes dsh's official provider to ignore the file (it only recognizes `.md` extensions), effectively "disabling" the skill.

## Installation

### Prerequisites

- DeepSeek Harness (dsh) desktop
- Node.js >= 18

### Integration in dsh-desktop

1. Add the plugin as a project dependency:

```bash
npm install @lijian-ui/dsh-skill-manage
```

2. Register the plugin in dsh desktop's plugin configuration (typically in `src/main/profile-init.ts`).

3. Restart the desktop app.

### Local Development

```bash
# Enter the plugin directory
cd extensions/dsh-skill-manage

# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run watch

# Type check
npm run typecheck
```

Build output goes to `lib/` and is automatically synced to `node_modules/@lijian-ui/dsh-skill-manage` via junction. Restart the desktop app after each build to load the new bundle.

## Usage

1. Open dsh desktop
2. Navigate to **Settings** → **Skill Manage**
3. In the skill list:
   - Click the toggle switch to enable/disable a skill
   - Click the delete button to permanently remove a skill
   - Click a skill card to view details
   - Use the search box to filter skills
   - Click "Add skill" and pick a .zip archive to import into the global skills directory

### Skill File Convention

| State | Directory Bundle | Flat File |
|---|---|---|
| Enabled | `<name>/SKILL.md` | `<name>.md` |
| Disabled | `<name>/SKILL.md.disabled` | `<name>.md.disabled` |

### Skill Scopes

| Scope | Path | Description |
|---|---|---|
| Global dsh | `~/.dsh/skills/` | User global skills |
| Global agents | `~/.agents/skills/` | Agents global skills |
| Workspace | `<workspace>/.dsh/skills/` | Project-level skills |
| Bundled | `DSH_BUNDLED_SKILL_DIR` | Deployment-bundled, read-only |

## Technical Architecture

### Directory Structure

```
extensions/dsh-skill-manage/
├── src/
│   ├── index.ts                    # Host entry
│   ├── remote.ts                   # Host RPC methods (list/setEnabled/deleteSkill etc.)
│   ├── skill-files.ts              # File conventions (DISABLED_SUFFIX, collectSkillEntries)
│   ├── skill-files.ts              # File conventions (DISABLED_SUFFIX, collectSkillEntries, frontmatter validation)
│   └── client/
│       ├── index.ts                # Client entry (SECTION_ID, RPC registration, inject)
│       ├── SkillManageSection.tsx  # Main settings component (card list + toggle + detail dialog)
│       └── client-i18n.ts         # Client i18n (zh/en)
├── lib/                            # Build output
├── docs/
│   └── troubleshooting-and-bugs.md # Troubleshooting & official bug analysis
├── package.json
└── tsdown.config.ts
```

### Host Side (`src/remote.ts`)

Provides the following RPC methods:

| Method | Function |
|---|---|
| `list(sessionId)` | List all skills with enabled status |
| `content(name, sessionId)` | Get full skill content |
| `setEnabled(name, sessionId, enabled)` | Enable/disable skill (file rename) |
| `deleteSkill(name, sessionId)` | Delete skill |
| `importZip(sessionId, payload)` | Extract a .zip archive and install the skill into the global skills dir (`<DSH_HOME>/skills`, default `~/.dsh/skills`) |
| `workspaces()` | List available workspaces |

### Client Side (`src/client/`)

- **`index.ts`**: Registers the settings section via `ctx.slots.inject`
- **`SkillManageSection.tsx`**: React component rendering skill cards, toggle switches, detail dialog, delete confirmation, and migration dialog
- **`client-i18n.ts`**: Chinese/English translations

### Toggle Mechanism

```
User clicks toggle
  → Client optimistically updates UI (immediate switch state change)
  → RPC call to host setEnabled
  → Host: rename(SKILL.md ↔ SKILL.md.disabled)
  → dsh chokidar watcher detects file change
  → Registry cache invalidated (revision++)
  → After 800ms delay, ctx.emit('connection/reset')
  → Client fetches Map cleared
  → Next / completion re-queries → gets latest skill list
```

## Known Issues & Solutions

### Slash command completion not refreshing after enabling a skill

**Issue**: After enabling a skill, the `/` slash command completion menu in the chat doesn't show the newly enabled skill.

**Root Cause**: dsh's official `dsh-client-ui-skill` package is missing a subscription to the `skills/change` event, causing the client-side skill list cache to never be invalidated when skill files change.

**Our Solution**: In `reloadAfterHot`, after an 800ms delay, call `ctx.emit('connection/reset')` to silently refresh all module caches. Since the user is in the settings panel, they won't perceive the cache refresh in the chat interface.

See [Troubleshooting & Bug Analysis](./docs/troubleshooting-and-bugs.md) for details.

## Internationalization

Supports Chinese and English. Translation files are in `src/client/client-i18n.ts`. Language follows the dsh desktop language setting.

## Tech Stack

- **Language**: TypeScript
- **Build**: tsdown (rolldown)
- **Frontend**: React 18
- **Markdown Rendering**: `MarkdownText` component from `@deepseek-ai/dsh-client-ui-primitives`
- **YAML Parsing**: yaml (frontmatter parsing)
- **File Watching**: dsh's official chokidar watcher (auto-detects skill file changes)

## License

MIT

## Related Links

- [Troubleshooting & Bug Analysis](./docs/troubleshooting-and-bugs.md)
- [DeepSeek Harness (dsh)](https://github.com/deepseek-ai/dsh)