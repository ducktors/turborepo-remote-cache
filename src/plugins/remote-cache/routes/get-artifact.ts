import { Type, Static } from '@sinclair/typebox'
import { getCachedArtifact } from '../local-storage'
import type { Server } from 'http'
import type { RouteOptions, RawRequestDefaultExpression, RawReplyDefaultExpression } from 'fastify'
import { notFound } from '@hapi/boom'

const getArtifactsSchema = {
  querystring: Type.Object(
    {
      teamId: Type.String(),
    },
    { additionalParameters: false },
  ),
  params: Type.Object(
    {
      id: Type.String(),
    },
    { additionalParameters: false },
  ),
}

export const getArtifact: RouteOptions<
  Server,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  {
    Querystring: Static<typeof getArtifactsSchema['querystring']>
    Params: Static<typeof getArtifactsSchema['params']>
  }
> = {
  method: 'GET',
  url: '/artifacts/:id',
  schema: getArtifactsSchema,
  async handler(req, reply) {
    const artifactId = req.params.id
    const teamId = req.query.teamId
    try {
      const artifact = await getCachedArtifact(artifactId, teamId)
      reply.send(artifact)
    } catch (err) {
      throw notFound(``, err)
    }
  },
}
