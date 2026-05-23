import type { Server } from 'http'
import { badRequest } from '@hapi/boom'
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
  authorization: 'read',
  async handler(req, reply) {
    const artifactId = req.params.id
    const team = req.query.teamId ?? req.query.team ?? req.query.slug // turborepo client passes team as slug when --team cli option is used
    if (!team) {
      throw badRequest(`querystring should have required property 'team'`)
    }

    try {
      // If signature verification is enabled, check for artifact tag existence first
      if (this.config.TURBO_REMOTE_CACHE_SIGNATURE_KEY) {
        try {
          await this.location.existsCachedArtifactTag(artifactId, team)
        } catch (err) {
          // A missing tag is treated as a cache miss
          req.log.info(err, `Could not retrieve artifact tag for ${artifactId}`)
          return reply.code(404).send({
            statusCode: 404,
            error: 'Not Found',
            message: 'Artifact tag not found',
          })
        }
      }

      if (this.config.TURBO_CACHE_READ_URL) {
        const base = this.config.TURBO_CACHE_READ_URL
        let artifactUrl: string
        try {
          const parsed = new URL(base)
          parsed.pathname = parsed.pathname.endsWith('/')
            ? `${parsed.pathname}${team}/${artifactId}`
            : `${parsed.pathname}/${team}/${artifactId}`
          artifactUrl = parsed.toString()
        } catch {
          const readUrl = base.endsWith('/') ? base : `${base}/`
          artifactUrl = `${readUrl}${team}/${artifactId}`
        }
        return reply.redirect(artifactUrl)
      }

      const artifact = await this.location.existsCachedArtifact(
        artifactId,
        team,
      )
      reply.send(artifact)
    } catch (err) {
      req.log.info(err, 'Artifact not found')
      return reply.code(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Artifact not found',
      })
    }
  },
}
