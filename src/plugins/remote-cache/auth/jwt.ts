import { Boom, forbidden, isBoom, unauthorized } from '@hapi/boom'
import { FastifyRequest } from 'fastify'
import { fastifyJwtJwks } from 'fastify-jwt-jwks'
import fp from 'fastify-plugin'

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { scope?: string }
    user: { scope: Set<string> }
  }
}

export default fp(async (fastify) => {
  if (!fastify.config.JWKS_URL) {
    throw new Error('Must provide JWKS url when using JWT authentication')
  }

  await fastify.register(fastifyJwtJwks, {
    audience: fastify.config.JWT_AUDIENCE,
    issuer: fastify.config.JWT_ISSUER,
    jwksUrl: fastify.config.JWKS_URL,
    formatUser(payload) {
      return { scope: new Set(payload.scope?.split(' ')) }
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
  })
})
