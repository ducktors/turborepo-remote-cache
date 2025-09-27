import type { Server } from 'http'
import { Readable } from 'stream'
import { badRequest, preconditionFailed } from '@hapi/boom'
import type {
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RouteOptions,
} from 'fastify'
import {
  Headers,
  type Params,
  type Querystring,
  artifactsRouteSchema,
} from './schema.js'

export const putArtifact: RouteOptions<
  Server,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  {
    Querystring: Querystring
    Params: Params
    Body: Buffer
    Headers: Headers
  }
> = {
  url: '/artifacts/:id',
  method: 'PUT',
  schema: artifactsRouteSchema,
  authorization: 'write',
  async handler(req, reply) {
    const artifactId = req.params.id
    const team = req.query.teamId ?? req.query.team ?? req.query.slug // turborepo client passes team as slug when --team cli option is used
    if (!team) {
      throw badRequest(`querystring should have required property 'team'`)
    }

    try {
      const artifactTag = req.headers['x-artifact-tag']
      const storagePromises: Promise<void>[] = []

      if (this.config.TURBO_REMOTE_CACHE_SIGNATURE_KEY && artifactTag) {
        storagePromises.push(
          this.location.createCachedArtifactTag(artifactId, team, artifactTag),
        )
      }

      storagePromises.push(
        this.location.createCachedArtifact(
          artifactId,
          team,
          Readable.from(req.body),
        ),
      )

      await Promise.all(storagePromises)

      reply.send({ urls: [`${team}/${artifactId}`] })
    } catch (err) {
      // we need this error throw since turbo retries if the error is in 5xx range
      throw preconditionFailed('Error during the artifact creation', err)
    }
  },
}
