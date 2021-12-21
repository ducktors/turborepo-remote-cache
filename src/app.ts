import Fastify, { FastifyInstance, FastifyServerOptions } from 'fastify'
import autoLoad from 'fastify-autoload'
import { join } from 'path'
import { isBoom } from '@hapi/boom'

export function createApp(options: FastifyServerOptions = {}): FastifyInstance {
  const app = Fastify(options)

  app.register(autoLoad, {
    dir: join(__dirname, './plugins'),
    dirNameRoutePrefix: false,
    maxDepth: 1,
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
