import { FastifyJWT } from '@fastify/jwt'
import { Boom, forbidden, isBoom, unauthorized } from '@hapi/boom'
import { FastifyRequest } from 'fastify'
import { fastifyJwtJwks } from 'fastify-jwt-jwks'
import fp from 'fastify-plugin'
import type { Querystring } from '../routes/schema.js'
import { getTeamFromQuery } from '../routes/utils.js'

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { [claim: string]: unknown }
    user: { scopes: Set<string>; roles: Set<string>; teams: Set<string> }
  }
}

export default fp(async (fastify) => {
  if (!fastify.config.JWKS_URL) {
    throw new Error('Must provide JWKS url when using JWT authentication')
  }

  function extractTokenScopes(payload: FastifyJWT['payload']): Set<string> {
    if (typeof fastify.config.JWT_SCOPE_CLAIM === 'string') {
      const scopeClaim = payload[fastify.config.JWT_SCOPE_CLAIM]

      if (typeof scopeClaim === 'string') {
        return new Set(scopeClaim.split(' '))
      }
    }

    return new Set<string>()
  }

  function extractUserRoles(payload: FastifyJWT['payload']): Set<string> {
    if (typeof fastify.config.JWT_ROLES_CLAIM === 'string') {
      const rolesClaim = payload[fastify.config.JWT_ROLES_CLAIM]

      if (
        Array.isArray(rolesClaim) &&
        rolesClaim.every((role) => typeof role === 'string')
      ) {
        return new Set(rolesClaim)
      }
    }

    return new Set<string>()
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
        scopes: extractTokenScopes(payload),
        roles: extractUserRoles(payload),
        teams: new Set(teams),
      } satisfies FastifyJWT['user']
    },
  })
  const readScopes = [fastify.config.JWT_READ_SCOPES || []].flat()
  const readRoles = [fastify.config.JWT_READ_ROLES || []].flat()

  async function authorizeRead(request: FastifyRequest) {
    if (
      readScopes.length !== 0 &&
      !readScopes.some((scope) => request.user.scopes.has(scope))
    ) {
      throw forbidden()
    }

    if (
      readRoles.length !== 0 &&
      !readRoles.some((role) => request.user.roles.has(role))
    ) {
      throw forbidden()
    }
  }

  const writeScopes = [fastify.config.JWT_WRITE_SCOPES || []].flat()
  const writeRoles = [fastify.config.JWT_WRITE_ROLES || []].flat()

  async function authorizeWrite(request: FastifyRequest) {
    if (
      writeScopes.length !== 0 &&
      !writeScopes.some((scope) => request.user.scopes.has(scope))
    ) {
      throw forbidden()
    }

    if (
      writeRoles.length !== 0 &&
      !writeRoles.some((role) => request.user.roles.has(role))
    ) {
      throw forbidden()
    }
  }

  fastify.addHook('onRequest', fastify.authenticate)
  fastify.addHook('onRoute', async (route) => {
    if (route.authorization && route.authorization === 'read') {
      route.onRequest = [...[route.onRequest ?? []].flat(), authorizeRead]
    }

    if (route.authorization && route.authorization === 'write') {
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
