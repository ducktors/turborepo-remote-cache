import { unauthorized } from '@hapi/boom'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

export default fp(async (fastify: FastifyInstance) => {
  const allowedTokens = fastify.config.TURBO_TOKEN
  if (!(Array.isArray(allowedTokens) && allowedTokens.length)) {
    throw new Error(
      `'allowedTokens' options must be a string[], ${typeof allowedTokens} provided instead`,
    )
  }
  const tokens = new Set(allowedTokens)

  fastify.addHook('onRequest', async (request) => {
    let authHeader = request.headers.authorization
    authHeader = Array.isArray(authHeader) ? authHeader.join() : authHeader

    if (!authHeader) {
      throw unauthorized()
    }
    const [, token] = authHeader.split('Bearer ')
    if (!tokens.has(token)) {
      throw unauthorized()
    }
  })
})
