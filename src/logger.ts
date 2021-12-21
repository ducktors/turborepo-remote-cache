import Pino from 'pino'

const PinoLevelToSeverityLookup: Record<string, string> = {
  trace: 'DEBUG',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  fatal: 'CRITICAL',
}

export const logger = Pino({
  enabled: !process.env.NOLOG,
  level: process.env.LOG_LEVEL ?? 'info',
  prettyPrint:
    !!process.env.PRETTY_LOGS && process.env.NODE_ENV === 'development'
      ? {
          colorize: true,
          ignore: 'pid,req,res,time,hostname,operationName,responseTime,path,operation',
          messageFormat: log => {
            // do some log message customization
            // eslint-disable-next-line
            const req = log.req as any
            // eslint-disable-next-line
            const res = log.res as any

            return `${req?.id ?? ''}${req?.method ? ` ${req.method}` : ''}${
              req?.url ? ` ${req?.url}` : ''
            }${log.operationName ? ` [${log.operationName}]` : ''}${
              res?.statusCode ? ` ${res?.statusCode}` : ''
            }${log.message ? ` ${log.message}` : ''}${
              log.responseTime ? ` - ${log.responseTime}ms` : ''
            }`
          },
        }
      : false,
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
