import type { Server } from 'http'
import type {
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RouteOptions,
} from 'fastify'
import { type Params, type Querystring } from './schema.js'
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
  logLevel: 'error',
  async handler(req, reply) {
    reply.send({
      status: 'enabled',
      version: process.env.npm_package_version ?? 'unknown',
    })
  },
}
