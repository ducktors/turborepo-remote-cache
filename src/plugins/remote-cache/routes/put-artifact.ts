import type { Server } from 'http'
import type { RouteOptions, RawRequestDefaultExpression, RawReplyDefaultExpression } from 'fastify'
import { badRequest, preconditionFailed } from '@hapi/boom'
import { Readable } from 'stream'
import { type Querystring, type Params, artifactsRouteSchema } from './schema'

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
      await this.location.createCachedArtifact(artifactId, teamId, Readable.from(req.body))

      reply.send({ urls: [`${teamId}/${artifactId}`] })
    } catch (err) {
      // we need this error throw since turbo retries if the error is in 5xx range
      throw preconditionFailed(`Error during the artifact creation`, err)
    }
  },
}
