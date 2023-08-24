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

let logDestination

if (env.LOG_TYPE === 'file') {
  logDestination = Pino.destination(env.LOG_DIR)
} else if (env.LOG_TYPE === 'stdout') {
  logDestination = process.stdout
} else {
  throw new Error('Invalid LOG_TYPE. Allowed values are "file" or "stdout".')
}

export const logger = Pino(
  {
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
  },
  logDestination,
)

export default logger
