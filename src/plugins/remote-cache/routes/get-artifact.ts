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

export const getArtifact: RouteOptions<
  Server,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  {
    Querystring: Querystring
    Params: Params
  }
> = {
  method: 'GET',
  exposeHeadRoute: false,
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
          const artifactTag = await this.location.getCachedArtifactTag(
            artifactId,
            team,
          )
          reply.header('x-artifact-tag', artifactTag)
        } catch (err) {
          // A missing tag is treated as a cache miss.
          // The client will validate and decide if it's acceptable.
          req.log.warn(err, `Could not retrieve artifact tag for ${artifactId}`)
        }
      }

      const artifact = await this.location.getCachedArtifact(artifactId, team)
      reply.header('Content-Type', 'application/octet-stream')
      return reply.send(artifact)
    } catch (err) {
      throw notFound('Artifact not found', err)
    }
  },
}
