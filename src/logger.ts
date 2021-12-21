import Pino from 'pino'
import { env } from './env'
const PinoLevelToSeverityLookup = {
  trace: 'DEBUG',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  fatal: 'CRITICAL',
} as const

export const logger = Pino({
  level: env.LOG_LEVEL,
  messageKey: 'message',
  redact: ['req.headers.authorization'],
  formatters: {
    level(label, number) {
      return {
        severity: PinoLevelToSeverityLookup[label] || PinoLevelToSeverityLookup['info'],
        level: number,
      }
    },
  },
})

export default logger
