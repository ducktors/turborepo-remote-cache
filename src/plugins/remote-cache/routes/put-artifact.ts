import type { Server } from 'http'
import { Readable } from 'stream'
import { badRequest, preconditionFailed } from '@hapi/boom'
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

export const putArtifact: RouteOptions<
  Server,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  {
    Querystring: Querystring
    Params: Params
    Body: Buffer
  }
> = {
  url: '/artifacts/:id',
  method: 'PUT',
  schema: artifactsRouteSchema,
  async handler(req, reply) {
    const artifactId = req.params.id
    const teamId = req.query.teamId ?? req.query.slug // turborepo client passes teamId as slug when --team cli option is used
    if (!teamId) {
      throw badRequest(`querystring should have required property 'teamId'`)
    }

    try {
      await this.location.createCachedArtifact(
        artifactId,
        teamId,
        Readable.from(req.body),
      )

      reply.send({ urls: [`${teamId}/${artifactId}`] })
    } catch (err) {
      // we need this error throw since turbo retries if the error is in 5xx range
      throw preconditionFailed('Error during the artifact creation', err)
    }
  },
}
