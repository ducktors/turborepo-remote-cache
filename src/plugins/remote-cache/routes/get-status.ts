import { readFileSync } from 'fs'
import type { Server } from 'http'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import type {
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RouteOptions,
} from 'fastify'
import { type Params, type Querystring } from './schema.js'
import { statusRouteSchema } from './status-schema.js'

// Get package.json version
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../../../../package.json'), 'utf8'),
)

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
  authorization: 'read',
  async handler(req, reply) {
    reply.send({
      status: 'enabled',
      version: packageJson.version,
    })
  },
}
