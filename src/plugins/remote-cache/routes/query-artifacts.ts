import type { Server } from 'http'
import { badRequest } from '@hapi/boom'
import { Type } from '@sinclair/typebox'
import type {
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RouteOptions,
} from 'fastify'
import { type Querystring } from './schema.js'

const artifactInfoSchema = Type.Object(
  {
    size: Type.Number(),
    taskDurationMs: Type.Number(),
    tag: Type.String(),
  },
  { additionalProperties: false },
)

const artifactErrorSchema = Type.Object(
  {
    error: Type.Object(
      {
        message: Type.String(),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
)

type ArtifactInfo = {
  size: number
  taskDurationMs: number
  tag: string
}

type ArtifactError = {
  error: {
    message: string
  }
}

export const queryArtifacts: RouteOptions<
  Server,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  {
    Body: {
      hashes: string[]
    }
    Querystring: Querystring
    Reply: Record<string, ArtifactInfo | ArtifactError>
  }
> = {
  method: 'POST',
  url: '/artifacts',
  authorization: 'read',
  schema: {
    body: Type.Object(
      {
        hashes: Type.Array(Type.String(), {
          description: 'artifact hashes',
        }),
      },
      { additionalProperties: false },
    ),
    response: {
      200: Type.Record(
        Type.String(),
        Type.Union([artifactInfoSchema, artifactErrorSchema]),
      ),
    },
  },
  async handler(request, reply) {
    const { hashes } = request.body
    const { teamId, team, slug } = request.query
    const teamIdentifier = teamId ?? team ?? slug

    if (!teamIdentifier) {
      throw new Error('Team identifier is required')
    }

    const result: Record<string, ArtifactInfo | ArtifactError> = {}

    for (const hash of hashes) {
      try {
        // TODO: implement a way to the the size of the artifact
        // await request.server.location.existsCachedArtifact(hash, teamIdentifier)

        result[hash] = {
          size: 0, // This should be fetched from storage
          taskDurationMs: 0,
          tag: '',
        }
      } catch (err) {
        throw badRequest('Artifact not found')
      }
    }

    reply.send(result)
  },
}
