import { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import jwtAuth from './jwt.js'
import staticAuth from './static.js'

declare module 'fastify' {
  interface RouteOptions {
    readonly authorization?: 'read' | 'write'
  }
}

export default fp(async (fastify: FastifyInstance) => {
  if (fastify.config.AUTH_MODE === 'jwt') {
    fastify.register(jwtAuth)
    fastify.log.info('Registered JWT auth')
  } else if (
    fastify.config.AUTH_MODE === 'static' ||
    fastify.config.AUTH_MODE === undefined
  ) {
    fastify.register(staticAuth)
    fastify.log.info('Registered static auth')
  } else if (fastify.config.AUTH_MODE === 'none') {
    fastify.log.info(
      'No authentication configured, open public access or authentication handled upstream',
    )
  } else {
    throw new Error(
      'Invalid AUTH_MODE, select either "jwt", "static", or "none"',
    )
  }
})
