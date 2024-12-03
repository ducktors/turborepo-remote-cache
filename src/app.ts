import { isBoom } from '@hapi/boom'
import Fastify, { FastifyInstance, FastifyServerOptions } from 'fastify'
import hyperid from 'hyperid'
import { Config } from './env.js'
import { logger } from './logger.js'
import config from './plugins/config.js'
import remoteCache from './plugins/remote-cache/index.js'

const uuid = hyperid({ urlSafe: true })

export function createApp(
  options: FastifyServerOptions & { configOverrides?: Partial<Config> } = {},
): FastifyInstance {
  const app = Fastify({
    loggerInstance: logger,
    genReqId: () => uuid(),
    ...options,
  })

  app.register(config, { overrides: options.configOverrides }).after(() => {
    app.register(remoteCache, {
      provider: app.config.STORAGE_PROVIDER,
    })
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
