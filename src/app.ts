import Fastify, { FastifyInstance, FastifyServerOptions } from 'fastify'
import hyperid from 'hyperid'
import { isBoom } from '@hapi/boom'
import remoteCache from './plugins/remote-cache'
import config from './plugins/config'
import { logger } from './logger'

const uuid = hyperid({ urlSafe: true })

export function createApp(options: FastifyServerOptions = {}): FastifyInstance {
  const app = Fastify({
    logger,
    genReqId: () => uuid(),
    ...options,
  })

  app.register(config).after(() => {
    app.register(remoteCache, {
      allowedTokens: [...app.config.TURBO_TOKEN],
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
