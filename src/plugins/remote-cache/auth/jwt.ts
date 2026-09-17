import { Boom, forbidden, isBoom, unauthorized } from '@hapi/boom'
import { FastifyRequest } from 'fastify'
import { fastifyJwtJwks } from 'fastify-jwt-jwks'
import fp from 'fastify-plugin'
import type { Querystring } from '../routes/schema.js'
import { getTeamFromQuery } from '../routes/utils.js'

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { scope?: string; [claim: string]: unknown }
    user: { scope: Set<string>; teams: Set<string> }
  }
}

export default fp(async (fastify) => {
  if (!fastify.config.JWKS_URL) {
    throw new Error('Must provide JWKS url when using JWT authentication')
  }

  const teamClaim = fastify.config.JWT_TEAM_CLAIM
  if (!teamClaim) {
    fastify.log.warn(
      'JWT_TEAM_CLAIM is not set. Each valid token can read and write the cache of all teams.',
    )
  }

  await fastify.register(fastifyJwtJwks, {
    audience: fastify.config.JWT_AUDIENCE,
    issuer: fastify.config.JWT_ISSUER,
    jwksUrl: fastify.config.JWKS_URL,
    formatUser(payload) {
      // The claim name is a top-level key of the payload. A namespaced claim
      // such as "https://example.com/teams" is also a top-level key.
      const claim = teamClaim ? payload[teamClaim] : undefined
      let teams: string[] = []
      if (typeof claim === 'string') {
        teams = claim.split(' ').filter((team) => team.length > 0)
      } else if (Array.isArray(claim)) {
        teams = claim.filter((team): team is string => typeof team === 'string')
      }
      return {
        scope: new Set(payload.scope?.split(' ')),
        teams: new Set(teams),
      }
    },
  })
  const readScopes = [fastify.config.JWT_READ_SCOPES || []].flat()
  const writeScopes = [fastify.config.JWT_WRITE_SCOPES || []].flat()
  fastify.addHook('onRequest', fastify.authenticate)
  fastify.addHook('onRoute', async (route) => {
    if (
      route.authorization &&
      route.authorization === 'read' &&
      readScopes.length > 0
    ) {
      async function authorizeRead(request: FastifyRequest) {
        if (!readScopes.some((scope) => request.user.scope.has(scope)))
          throw forbidden()
      }
      route.onRequest = [...[route.onRequest ?? []].flat(), authorizeRead]
    }

    if (
      route.authorization &&
      route.authorization === 'write' &&
      writeScopes.length > 0
    ) {
      async function authorizeWrite(request: FastifyRequest) {
        if (!writeScopes.some((scope) => request.user.scope.has(scope)))
          throw forbidden()
      }
      route.onRequest = [...[route.onRequest ?? []].flat(), authorizeWrite]
    }

    if (teamClaim && route.authorization) {
      // This check is a preHandler hook and not an onRequest hook. A
      // preHandler hook runs after schema validation, so it reads the same
      // request.query as the route handler. The Fastify Ajv instance removes
      // query properties that the route schema does not declare, for example
      // teamId on POST /clean.
      async function authorizeTeam(request: FastifyRequest) {
        const team = getTeamFromQuery(request.query as Querystring)
        // A request without a team does not touch team data, for example
        // POST /artifacts/events. The routes that use a team reject a
        // missing team with 400.
        if (team !== undefined && !request.user.teams.has(team))
          throw forbidden()
      }
      route.preHandler = [...[route.preHandler ?? []].flat(), authorizeTeam]
    }
  })

  fastify.setErrorHandler(
    async (error: Error & { code?: string; statusCode?: number }, req, res) => {
      if (isBoom(error)) {
        throw error
      }
      if (typeof error.statusCode === 'number' && error.statusCode < 500) {
        req.log.warn(
          { err: error, code: error.code },
          'JWT authentication failed',
        )
        throw new Boom(error.message, { statusCode: error.statusCode })
      }
      req.log.error(
        { err: error, code: error.code },
        'Unexpected error in JWT handler',
      )
      throw unauthorized()
    },
  )
})
