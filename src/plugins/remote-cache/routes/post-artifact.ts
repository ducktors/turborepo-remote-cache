import { Type, Static } from '@sinclair/typebox'
import { createCachedArtifact } from '../local-storage'
import type { Server } from 'http'
import type { RouteOptions, RawRequestDefaultExpression, RawReplyDefaultExpression } from 'fastify'

const postArtifactsSchema = {
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

export const createArtifact: Omit<
  RouteOptions<
    Server,
    RawRequestDefaultExpression,
    RawReplyDefaultExpression,
    {
      Querystring: Static<typeof postArtifactsSchema['querystring']>
      Params: Static<typeof postArtifactsSchema['params']>
      Body: Buffer
    }
  >,
  'method'
> = {
  url: '/artifacts/:id',
  schema: postArtifactsSchema,
  async handler(req, reply) {
    const artifactId = req.params.id
    const teamId = req.query.teamId
    const artifactUrl = await createCachedArtifact(artifactId, teamId, req.body)

    reply.send({ urls: [`${teamId}/${artifactUrl}`] })
  },
}
