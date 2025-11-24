import { FastifyJWT } from '@fastify/jwt'
import { Boom, forbidden, isBoom, unauthorized } from '@hapi/boom'
import { FastifyRequest } from 'fastify'
import { fastifyJwtJwks } from 'fastify-jwt-jwks'
import fp from 'fastify-plugin'

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { [claim: string]: string | string[] | undefined }
    user: { scopes: Set<string>; roles: Set<string> }
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

  await fastify.register(fastifyJwtJwks, {
    audience: fastify.config.JWT_AUDIENCE,
    issuer: fastify.config.JWT_ISSUER,
    jwksUrl: fastify.config.JWKS_URL,
    formatUser(payload) {
      return {
        scopes: extractTokenScopes(payload),
        roles: extractUserRoles(payload),
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
  })

  fastify.setErrorHandler(async (error, req, res) => {
    if (isBoom(error)) {
      throw error
    } else if (error.code?.startsWith('FST_JWT_')) {
      throw new Boom(error.message, {
        statusCode: error.statusCode || 500,
      })
    } else {
      throw unauthorized()
    }
  })
})
