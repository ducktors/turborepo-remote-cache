import type { Server } from 'http'
import type { RouteOptions, RawReplyDefaultExpression, RawRequestDefaultExpression } from 'fastify'

export const getHealth: RouteOptions<
  Server,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression
> = {
  method: 'GET',
  url: '/health',
  async handler(req, reply) {
    reply.send('Server is running 🙌')
  },
}
