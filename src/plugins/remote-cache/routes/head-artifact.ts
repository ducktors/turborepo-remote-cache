import type { Server } from 'http'
import { badRequest, notFound } from '@hapi/boom'
import type {
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RouteOptions,
} from 'fastify'
import {
  type Params,
  type Querystring,
  artifactsRouteSchema,
} from './schema.js'

export const headArtifact: RouteOptions<
  Server,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  {
    Querystring: Querystring
    Params: Params
  }
> = {
  method: 'HEAD',
  url: '/artifacts/:id',
  schema: artifactsRouteSchema,
  authorization: 'read',
  async handler(req, reply) {
    const artifactId = req.params.id
    const team = req.query.teamId ?? req.query.team ?? req.query.slug // turborepo client passes team as slug when --team cli option is used
    if (!team) {
      throw badRequest(`querystring should have required property 'team'`)
    }

    try {
      if (this.config.TURBO_REMOTE_CACHE_SIGNATURE_KEY) {
        try {
          // A missing tag is treated as a cache miss, so we check for both.
          await this.location.existsCachedArtifactTag(artifactId, team)
        } catch (err) {
          req.log.warn(err, `Could not retrieve artifact tag for ${artifactId}`)
          throw notFound('Artifact tag not found', err)
        }
      }
      const artifact = await this.location.existsCachedArtifact(
        artifactId,
        team,
      )
      reply.send(artifact)
    } catch (err) {
      throw notFound('Artifact not found', err)
    }
  },
}
