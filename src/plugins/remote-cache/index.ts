// turborepo-remote-cache
// dependencies: fastify, boom, @aws/s3
// https://api.vercel.com/v8/artifacts/09b4848294e347d8?teamID=team_lMDgmODIeVfSbCQNQPDkX8cF
// https://github.com/Tapico/tapico-turborepo-remote-cache/blob/4d12cbca59fed053b24fa7a2c88cddfc5f46198c/main.go#L192

import { FastifyInstance } from 'fastify'

import { getArtifact } from './routes/get-artifact'
import { createArtifact } from './routes/post-artifact'
import { env } from '../../env'

async function turboRemoteCache(instance: FastifyInstance, options: { allowedTokens: string[] }) {
  const { allowedTokens } = options
  if (!(Array.isArray(allowedTokens) && allowedTokens.length)) {
    throw new Error(
      `'allowedTokens' options must be a string[], ${typeof allowedTokens} provided instead`,
    )
  }
  instance.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer', bodyLimit: 104857600 },
    async function streamParser(request, payload) {
      return payload
    },
  )
  const tokens = new Set<string>(allowedTokens)
  instance.addHook('onRequest', async function (request) {
    let authHeader = request.headers['authorization']
    authHeader = Array.isArray(authHeader) ? authHeader.join() : authHeader

    if (!authHeader) {
      throw new Error(`Missing Authorization header`) // TODO: add proper boom error
    }
    const [, token] = authHeader.split('Bearer ')
    if (!tokens.has(token)) {
      throw new Error(`The provided token isn't valid`)
    }
  })

  instance.route(getArtifact)
  instance.route({ method: 'POST', ...createArtifact })
  instance.route({ method: 'PUT', ...createArtifact })
}

export const autoConfig = {
  allowedTokens: [env.TOKEN],
  prefix: 'v8',
}

export default turboRemoteCache
