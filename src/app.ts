import * as fs from 'node:fs'
import { isBoom } from '@hapi/boom'
import Fastify, { FastifyInstance, FastifyServerOptions } from 'fastify'
import hyperid from 'hyperid'
import { Config, env } from './env.js'
import { logger } from './logger.js'
import config from './plugins/config.js'
import remoteCache from './plugins/remote-cache/index.js'

const uuid = hyperid({ urlSafe: true })

export function createApp(
  options: FastifyServerOptions & { configOverrides?: Partial<Config> } = {},
): FastifyInstance {
  const SSL_CERT_PATH = env.get().SSL_CERT_PATH
  const SSL_KEY_PATH = env.get().SSL_KEY_PATH
  const isHttps =
    SSL_CERT_PATH &&
    SSL_KEY_PATH &&
    fs.existsSync(SSL_CERT_PATH) &&
    fs.existsSync(SSL_KEY_PATH)

  const fastifyOptions: FastifyServerOptions = {
    ...options,
    ...(env.get().HTTP2 ? { http2: true } : {}),
    ...(isHttps
      ? {
          https: {
            key: fs.readFileSync(SSL_KEY_PATH),
            cert: fs.readFileSync(SSL_CERT_PATH),
          },
        }
      : {}),
  }

  const hasConfiguredLogger =
    'logger' in fastifyOptions || 'loggerInstance' in fastifyOptions

  /**
   * Fastify does not allow both loggerInstance and logger to be set
   */
  if (!hasConfiguredLogger) {
    fastifyOptions.loggerInstance = logger
  }

  const app = Fastify({
    genReqId: () => uuid(),
    ...fastifyOptions,
  })

  app.register(config, { overrides: options.configOverrides }).after(() => {
    app.register(remoteCache, {
      provider: app.config.STORAGE_PROVIDER,
    })
  })

  app.get('/favicon.ico', {
    logLevel: 'silent',
    handler: (request, reply) => {
      reply.code(204).send()
    },
  })

  app.setErrorHandler((err, request, reply) => {
    if (err.validation) {
      reply.log.warn(err)
      reply.code(400).send({ message: err.message })
    } else if (isBoom(err)) {
      reply.log.warn(err)
      reply
        .code(err.output.statusCode)
        .send(
          err.data != null
            ? { message: err.message, ...err.data }
            : { message: err.output.payload.message },
        )
    } else {
      request.log.error(err)
      reply.code(500).send({ message: err.message })
    }
  })

  return app
}
