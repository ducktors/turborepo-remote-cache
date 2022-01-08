// turborepo-remote-cache
// dependencies: fastify, boom, @aws/s3
// https://api.vercel.com/v8/artifacts/09b4848294e347d8?teamID=team_lMDgmODIeVfSbCQNQPDkX8cF
// https://github.com/Tapico/tapico-turborepo-remote-cache/blob/4d12cbca59fed053b24fa7a2c88cddfc5f46198c/main.go#L192

import { FastifyInstance } from 'fastify'
import { badRequest, unauthorized } from '@hapi/boom'
import { getArtifact, putArtifact } from './routes'
import { createCachedArtifact, getCachedArtifact } from './storage'

async function turboRemoteCache(
  instance: FastifyInstance,
  options: { allowedTokens: string[]; bodyLimit?: number; apiVersion?: `v${number}` },
) {
  const { allowedTokens, bodyLimit = 104857600, apiVersion = 'v8' } = options
  if (!(Array.isArray(allowedTokens) && allowedTokens.length)) {
    throw new Error(
      `'allowedTokens' options must be a string[], ${typeof allowedTokens} provided instead`,
    )
  }

  instance.addContentTypeParser<Buffer>(
    'application/octet-stream',
    { parseAs: 'buffer', bodyLimit },
    async function parser(request, payload) {
      return payload
    },
  )

  const tokens = new Set<string>(allowedTokens)
  instance.addHook('onRequest', async function (request) {
    let authHeader = request.headers['authorization']
    authHeader = Array.isArray(authHeader) ? authHeader.join() : authHeader

    if (!authHeader) {
      throw badRequest(`Missing Authorization header`)
    }
    const [, token] = authHeader.split('Bearer ')
    if (!tokens.has(token)) {
      throw unauthorized(`Invalid authorization token`)
    }
  })

  instance.decorate('location', { getCachedArtifact, createCachedArtifact })

  await instance.register(
    async function (i) {
      i.route(getArtifact)
      i.route(putArtifact)
    },
    { prefix: `/${apiVersion}` },
  )
}

export default turboRemoteCache
