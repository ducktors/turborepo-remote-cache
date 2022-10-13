import type { Server } from 'http'
import type { RouteOptions, RawRequestDefaultExpression, RawReplyDefaultExpression } from 'fastify'
import { notFound, badRequest } from '@hapi/boom'
import { type Querystring, type Params, artifactsRouteSchema } from './schema'

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
  async handler(req, reply) {
    const artifactId = req.params.id
    const teamId = req.query.teamId ?? req.query.slug // turborepo client passes teamId as slug when --team cli option is used
    if (!teamId) {
      throw badRequest(`querystring should have required property 'teamId'`)
    }

    try {
      const artifact = await this.location.existsCachedArtifact(artifactId, teamId)
      reply.send(artifact)
    } catch (err) {
      throw notFound(`Artifact not found`, err)
    }
  },
}
