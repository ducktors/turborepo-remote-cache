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

// The claim name is a top-level key of the payload. A namespaced claim such as
// "https://example.com/teams" is also a top-level key. The claim value can be
// a string with values separated by spaces, or an array of strings. Any other
// value gives no values.
function readClaimValues(
  payload: { [claim: string]: unknown },
  claimName: string,
): string[] {
  const claim = payload[claimName]
  if (typeof claim === 'string') {
    return claim.split(' ').filter((value) => value.length > 0)
  }
  if (Array.isArray(claim)) {
    return claim.filter((value): value is string => typeof value === 'string')
  }
  return []
}

// The env schema splits a comma-separated value into an array. A trailing comma
// gives an empty item. A token claim with an empty item must not match it.
function requiredValues(value: string | string[] | undefined): string[] {
  return [value || []].flat().filter((item) => item.length > 0)
}

// A token must have one of the required values. An empty list of required
// values adds no requirement.
function hasOneOf(required: string[], values: Set<string>) {
  return required.length === 0 || required.some((value) => values.has(value))
}

export default fp(async (fastify) => {
  if (!fastify.config.JWKS_URL) {
    throw new Error('Must provide JWKS url when using JWT authentication')
  }

  // An empty claim name has the same effect as no value.
  const scopeClaim = fastify.config.JWT_SCOPE_CLAIM || 'scope'
  const rolesClaim = fastify.config.JWT_ROLES_CLAIM || 'roles'
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
      return {
        scopes: new Set(readClaimValues(payload, scopeClaim)),
        roles: new Set(readClaimValues(payload, rolesClaim)),
        teams: new Set(teamClaim ? readClaimValues(payload, teamClaim) : []),
      }
    },
  })
  const readScopes = requiredValues(fastify.config.JWT_READ_SCOPES)
  const writeScopes = requiredValues(fastify.config.JWT_WRITE_SCOPES)
  const readRoles = requiredValues(fastify.config.JWT_READ_ROLES)
  const writeRoles = requiredValues(fastify.config.JWT_WRITE_ROLES)
  fastify.addHook('onRequest', fastify.authenticate)
  fastify.addHook('onRoute', async (route) => {
    // When scopes and roles are both set, the token must pass both checks.
    if (
      route.authorization &&
      route.authorization === 'read' &&
      (readScopes.length > 0 || readRoles.length > 0)
    ) {
      async function authorizeRead(request: FastifyRequest) {
        if (
          !hasOneOf(readScopes, request.user.scopes) ||
          !hasOneOf(readRoles, request.user.roles)
        )
          throw forbidden()
      }
      route.onRequest = [...[route.onRequest ?? []].flat(), authorizeRead]
    }

    if (
      route.authorization &&
      route.authorization === 'write' &&
      (writeScopes.length > 0 || writeRoles.length > 0)
    ) {
      async function authorizeWrite(request: FastifyRequest) {
        if (
          !hasOneOf(writeScopes, request.user.scopes) ||
          !hasOneOf(writeRoles, request.user.roles)
        )
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
