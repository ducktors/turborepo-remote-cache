import type { Server } from 'node:http'
import type {
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RouteOptions,
} from 'fastify'
import type { Params, Querystring } from './schema.js'
import { statusRouteSchema } from './status-schema.js'

export const getStatus: RouteOptions<
  Server,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  {
    Querystring: Querystring
    Params: Params
  }
> = {
  method: 'GET',
  url: '/artifacts/status',
  schema: statusRouteSchema,
  logLevel: process.env.ENABLE_STATUS_LOG === 'true' ? 'info' : 'silent',
  authorization: 'read',
  async handler(req, reply) {
    reply.send({
      status: 'enabled',
    })
  },
}
