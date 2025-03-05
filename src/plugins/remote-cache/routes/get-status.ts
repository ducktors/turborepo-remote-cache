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
  logLevel: process.env.LOG_LEVEL_PROBE === 'true' ? 'info' : 'silent',
  authorization: 'read',
  async handler(req, reply) {
    reply.send({
      status: 'enabled',
      version:
        process.env.PACKAGE_VERSION ??
        process.env.npm_package_version ??
        'unknown',
    })
  },
}
