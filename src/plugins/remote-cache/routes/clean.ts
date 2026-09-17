import type { Server } from 'http'
import { badRequest, forbidden } from '@hapi/boom'
import type {
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RouteOptions,
} from 'fastify'
import {
  DEFAULT_OLDER_THAN_DAYS,
  type Querystring,
  cleanRouteSchema,
} from './clean-schema.js'
import { assertSafePathSegment, getTeamFromQuery } from './utils.js'

export const cleanCache: RouteOptions<
  Server,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  {
    Querystring: Querystring
  }
> = {
  method: 'POST',
  url: '/clean',
  schema: cleanRouteSchema,
  authorization: 'write',
  async handler(req, reply) {
    if (this.config.READ_ONLY) {
      throw forbidden('Remote cache is running in read-only mode')
    }

    // Use the same team resolver as the JWT team authorization.
    const slug = getTeamFromQuery(req.query)
    if (!slug) {
      throw badRequest(`querystring must have required property 'slug'`)
    }
    assertSafePathSegment(slug, 'slug')

    const olderThanDays = req.query.olderThan ?? DEFAULT_OLDER_THAN_DAYS
    const result = await this.location.cleanStaleArtifacts(slug, olderThanDays)

    return reply.send(result)
  },
}
