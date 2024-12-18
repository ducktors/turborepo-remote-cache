import type { Server } from 'http'
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
  async handler(_req, reply) {
    reply.code(200).send({})
  },
}
