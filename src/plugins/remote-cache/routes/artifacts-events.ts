import type { Server } from 'http'
import type { RouteOptions, RawRequestDefaultExpression, RawReplyDefaultExpression } from 'fastify'

export const artifactsEvents: RouteOptions<
  Server,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression
> = {
  method: 'POST',
  url: '/artifacts/events',
  async handler(_req, reply) {
    reply.code(200).send({})
  },
}
