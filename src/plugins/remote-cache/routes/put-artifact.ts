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
import { assertSafePathSegment, getTeamFromQuery } from './utils.js'

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
    const team = getTeamFromQuery(req.query)
    if (!team) {
      throw badRequest(`querystring should have required property 'team'`)
    }
    assertSafePathSegment(team, 'team')
    assertSafePathSegment(artifactId, 'id')

    const { value: bodyLimit } = resolveBodyLimit(this.config.BODY_LIMIT)

    // Reject oversized uploads up front when the client advertises the size,
    // so we never start streaming to storage. The guard inside
    // createCachedArtifact is the backstop for chunked/unknown-length requests.
    // A negative or non-numeric advertised length is meaningless, so it can
    // neither pass nor fail this check on its own; such requests fall through
    // to the in-pipeline byte counter like any unknown-length upload.
    const contentLength = Number(req.headers['content-length'])
    if (
      Number.isFinite(contentLength) &&
      contentLength >= 0 &&
      contentLength > bodyLimit
    ) {
      // Close the connection, as the Fastify body parser does when a body
      // fails. Otherwise Node reads and discards the whole declared body
      // before it reuses the connection. HTTP/2 forbids this header.
      if (req.raw.httpVersionMajor === 1) {
        reply.header('connection', 'close')
      }
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
      // When the upload fails before the body ends, `pipeline()` destroys the
      // request and the server stops reading the socket. The Fastify body
      // parser closes the connection on a body error, because the client can
      // send more data. Do the same, or the next request on a keep-alive
      // connection gets no response. HTTP/2 forbids this header.
      if (req.raw.httpVersionMajor === 1 && !req.raw.complete) {
        reply.header('connection', 'close')
      }
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
