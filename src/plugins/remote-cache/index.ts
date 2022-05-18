import { FastifyInstance } from 'fastify'
import { badRequest, unauthorized } from '@hapi/boom'
import { getArtifact, putArtifact } from './routes'
import { createLocation } from './storage'
import { STORAGE_PROVIDERS } from '../../env'

async function turboRemoteCache(
  instance: FastifyInstance,
  options: {
    allowedTokens: string[]
    bodyLimit?: number
    apiVersion?: `v${number}`
    provider?: STORAGE_PROVIDERS
  },
) {
  const {
    allowedTokens,
    bodyLimit = 104857600,
    apiVersion = 'v8',
    provider = STORAGE_PROVIDERS.LOCAL,
  } = options
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

  instance.decorate(
    'location',
    createLocation(provider, {
      path: instance.config.STORAGE_PATH,
      endpoint: instance.config.S3_ENDPOINT,
    }),
  )

  await instance.register(
    async function (i) {
      i.route(getArtifact)
      i.route(putArtifact)
    },
    { prefix: `/${apiVersion}` },
  )
}

export default turboRemoteCache
