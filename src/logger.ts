import { pino } from 'pino'
import { env as _env } from './env.js'

const PinoLevelToSeverityLookup = {
  trace: 'DEBUG',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  fatal: 'CRITICAL',
} as const

const env = _env.get()

export const logger = pino({
  level: env.LOG_LEVEL,
  messageKey: 'message',
  redact: ['req.headers.authorization'],
  formatters: {
    level(label, number) {
      return {
        severity:
          PinoLevelToSeverityLookup[label] || PinoLevelToSeverityLookup.info,
        level: number,
      }
    },
  },
  transport:
    env.LOG_MODE === 'file'
      ? { target: 'pino/file', options: { destination: env.LOG_FILE } }
      : undefined,
})

export default logger
