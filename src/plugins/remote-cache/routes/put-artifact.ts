import type { Server } from 'http'
import type { Readable } from 'node:stream'
import {
  badRequest,
  entityTooLarge,
  forbidden,
  isBoom,
  preconditionFailed,
} from '@hapi/boom'
import type {
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RouteOptions,
} from 'fastify'
import { resolveBodyLimit } from '../../../env.js'
import {
  type Headers,
  type Params,
  type Querystring,
  artifactsRouteSchemaWithHeaders,
} from './schema.js'

export const putArtifact: RouteOptions<
  Server,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  {
    Querystring: Querystring
    Params: Params
    Headers: Headers
    Body: Readable
  }
> = {
  url: '/artifacts/:id',
  method: 'PUT',
  schema: artifactsRouteSchemaWithHeaders,
  authorization: 'write',
  async handler(req, reply) {
    if (this.config.READ_ONLY) {
      throw forbidden('Remote cache is running in read-only mode')
    }
    const artifactId = req.params.id
    const team = req.query.teamId ?? req.query.team ?? req.query.slug // turborepo client passes team as slug when --team cli option is used
    if (!team) {
      throw badRequest(`querystring should have required property 'team'`)
    }

    const { value: bodyLimit } = resolveBodyLimit(this.config.BODY_LIMIT)

    // Reject oversized uploads up front when the client advertises the size,
    // so we never start streaming to storage. The guard inside
    // createCachedArtifact is the backstop for chunked/unknown-length requests.
    const contentLength = Number(req.headers['content-length'])
    if (Number.isFinite(contentLength) && contentLength > bodyLimit) {
      throw entityTooLarge('Request body is too large')
    }

    try {
      const artifactTag = req.headers['x-artifact-tag']

      const storagePromises: Promise<void>[] = [
        this.location.createCachedArtifact(
          artifactId,
          team,
          req.body,
          bodyLimit,
        ),
      ]

      if (this.config.TURBO_REMOTE_CACHE_SIGNATURE_KEY && artifactTag) {
        storagePromises.push(
          this.location.createCachedArtifactTag(artifactId, team, artifactTag),
        )
      }

      await Promise.all(storagePromises)

      reply.send({ urls: [`${team}/${artifactId}`] })
    } catch (err) {
      // Surface a body-too-large rejection from the streaming guard as 413
      // instead of masking it as a generic storage error.
      if (isBoom(err) && err.output.statusCode === 413) {
        throw err
      }
      // we need this error throw since turbo retries if the error is in 5xx range
      throw preconditionFailed('Error during the artifact creation', err)
    }
  },
}
