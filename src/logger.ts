import Pino from 'pino'
import { env as _env } from './env.js'

const PinoLevelToSeverityLookup = {
  trace: 'DEBUG',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  fatal: 'CRITICAL',
} as const

let logDestination

const env = _env.get()

if (env.LOG_MODE === 'file') {
  logDestination = Pino.destination(env.LOG_FILE)
} else if (env.LOG_MODE === 'stdout') {
  logDestination = process.stdout
} else {
  throw new Error('Invalid LOG_MODE. Allowed values are "file" or "stdout".')
}

export const logger = Pino(
  {
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
  },
  logDestination,
)

export default logger
