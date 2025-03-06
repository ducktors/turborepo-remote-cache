import type { Server } from 'http'
import { Type } from '@sinclair/typebox'
import type {
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RouteOptions,
} from 'fastify'

const eventSchema = Type.Object(
  {
    sessionId: Type.String({
      description:
        'A UUID (universally unique identifer) for the session that generated this event.',
    }),
    source: Type.Union([Type.Literal('LOCAL'), Type.Literal('REMOTE')], {
      description:
        "One of `LOCAL` or `REMOTE`. `LOCAL` specifies that the cache event was from the user's filesystem cache. `REMOTE` specifies that the cache event is from a remote cache.",
    }),
    event: Type.Union([Type.Literal('HIT'), Type.Literal('MISS')], {
      description:
        'One of `HIT` or `MISS`. `HIT` specifies that a cached artifact for `hash` was found in the cache. `MISS` specifies that a cached artifact with `hash` was not found.',
    }),
    hash: Type.String({
      description: 'The artifact hash',
      examples: ['12HKQaOmR5t5Uy6vdcQsNIiZgHGB'],
    }),
    duration: Type.Optional(
      Type.Number({
        description:
          'The time taken to generate the artifact. This should be sent as a body parameter on `HIT` events.',
        examples: [400],
      }),
    ),
  },
  {
    additionalProperties: false,
  },
)

export const artifactsEvents: RouteOptions<
  Server,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  {
    Body: Array<{
      sessionId: string
      source: 'LOCAL' | 'REMOTE'
      event: 'HIT' | 'MISS'
      hash: string
      duration?: number
    }>
  }
> = {
  method: 'POST',
  url: '/artifacts/events',
  authorization: 'read',
  schema: {
    body: Type.Array(eventSchema),
    response: {
      200: Type.Object({}, { additionalProperties: false }),
    },
  },
  async handler(_req, reply) {
    reply.code(200).send({})
  },
}
