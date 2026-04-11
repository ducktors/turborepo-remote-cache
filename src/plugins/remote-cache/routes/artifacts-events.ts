import type { Server } from 'http'
import { forbidden } from '@hapi/boom'
import type {
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RouteOptions,
} from 'fastify'

export const artifactsEvents: RouteOptions<
  Server,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression
> = {
  method: 'POST',
  url: '/artifacts/events',
  authorization: 'read',
  async handler(req, reply) {
    if (this.config.READ_ONLY) {
      throw forbidden('Remote cache is running in read-only mode')
    }
    reply.code(200).send({})
  },
}
