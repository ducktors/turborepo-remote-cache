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

function assertSafeTeamSlug(slug: string): void {
  if (
    slug === '.' ||
    slug.includes('..') ||
    slug.includes('/') ||
    slug.includes('\\')
  ) {
    throw badRequest('Invalid slug')
  }
}

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

    const slug = req.query.slug
    assertSafeTeamSlug(slug)

    const olderThanDays = req.query.olderThan ?? DEFAULT_OLDER_THAN_DAYS
    const result = await this.location.cleanStaleArtifacts(slug, olderThanDays)

    return reply.send(result)
  },
}
