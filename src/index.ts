import { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-settings'
import { registerSkillManageRemote } from './remote.js'

// 只保留确实必需的 host 服务：cordis 的 inject 是硬依赖，声明了但运行环境
// 不提供的服务会让整个 apply 一直被挂起、永不执行（例如 web profile 可能没有
// skills / agents / tools）。skills / sessions / agents / tools 一律改为在代码里
// 按需、防御式取用（ctx.get(...) + 空值判断）。
export const inject = ['typert', 'settings']

const NS = 'skill-manage'

export const Config = Schema.object({})

export function apply(ctx: Context): void {
  installConsoleLoggerExporter(ctx)

  ctx.settings?.installSection(ctx, NS, Config, {}, {
    setSource: () => {},
    onChange: () => {},
  })

  registerSkillManageRemote(ctx)
}

function installConsoleLoggerExporter(ctx: Context): void {
  try {
    const logger = ctx.root.logger as unknown as {
      exporter?(opts: {
        colors?: number
        export: (message: { name?: string; type?: string; args?: unknown[] }) => void
      }): unknown
    }
    logger?.exporter?.({
      colors: 0,
      export: (message) => {
        const { name = 'skill-manage', type = 'log', args = [] } = message
        const rendered = args
          .map((arg) =>
            arg instanceof Error
              ? (arg.stack ?? arg.message)
              : typeof arg === 'string'
                ? arg
                : (() => {
                    try {
                      return JSON.stringify(arg)
                    } catch {
                      return String(arg)
                    }
                  })(),
          )
          .join(' ')
        const line = `[${name}] ${rendered}`
        if (type === 'error') console.error(line)
        else if (type === 'warn') console.warn(line)
        else if (type === 'debug') console.debug(line)
        else console.info(line)
      },
    })
  } catch {
  }
}