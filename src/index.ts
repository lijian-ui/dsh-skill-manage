import { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { registerSkillManageRemote } from './remote.js'

export const inject = ['typert', 'settings', 'skills', 'sessions', 'agents']

const NS = settingsNamespace('skill-manage')

export const Config = Schema.object({})

export function apply(ctx: Context): void {
  installConsoleLoggerExporter(ctx)

  installSettingsSection(ctx, NS, Config, {}, {
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