import type { Server } from 'http'
import { badRequest } from '@hapi/boom'
import type {
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RouteOptions,
} from 'fastify'
import { ArtifactNotFoundError } from '../storage/index.js'
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
      // If signature verification is enabled, check for artifact tag first.
      // A missing tag is treated as a cache miss (handled in the catch below).
      if (this.config.TURBO_REMOTE_CACHE_SIGNATURE_KEY) {
        const artifactTag = await this.location.getCachedArtifactTag(
          artifactId,
          team,
        )
        reply.header('x-artifact-tag', artifactTag)
      }

      const artifact = await this.location.getCachedArtifact(artifactId, team)
      reply.header('Content-Type', 'application/octet-stream')
      return reply.send(artifact)
    } catch (err) {
      // Only a genuine "not found" is a cache miss (404). Any other error is a
      // real backend failure: rethrow it so it surfaces as a 5xx and shows up
      // in logs/metrics instead of masquerading as a cache miss.
      if (err instanceof ArtifactNotFoundError) {
        req.log.info(err, 'Artifact not found')
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Artifact not found',
        })
      }
      req.log.error(err, `Failed to fetch artifact ${artifactId}`)
      throw err
    }
  },
}
