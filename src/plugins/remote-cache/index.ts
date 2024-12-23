import { FastifyInstance } from 'fastify'
import { STORAGE_PROVIDERS } from '../../env.js'
import auth from './auth/index.js'
import {
  artifactsEvents,
  getArtifact,
  getStatus,
  headArtifact,
  putArtifact,
} from './routes/index.js'
import { createLocation } from './storage/index.js'

async function turboRemoteCache(
  instance: FastifyInstance,
  options: {
    apiVersion?: `v${number}`
    provider?: STORAGE_PROVIDERS
  },
) {
  const bodyLimit = <number>instance.config.BODY_LIMIT
  const { apiVersion = 'v8', provider = STORAGE_PROVIDERS.LOCAL } = options

  instance.addContentTypeParser<Buffer>(
    'application/octet-stream',
    { parseAs: 'buffer', bodyLimit },
    async function parser(request, payload) {
      return payload
    },
  )

  instance.decorate(
    'location',
    createLocation(provider, {
      accessKey: instance.config.S3_ACCESS_KEY,
      secretKey: instance.config.S3_SECRET_KEY,
      path: instance.config.STORAGE_PATH,
      region: instance.config.S3_REGION,
      endpoint: instance.config.S3_ENDPOINT,
      clientEmail: instance.config.GCS_CLIENT_EMAIL,
      privateKey: instance.config.GCS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      projectId: instance.config.GCS_PROJECT_ID,
      useTmp: !!instance.config.STORAGE_PATH_USE_TMP_FOLDER,
      connectionString: instance.config.ABS_CONNECTION_STRING,
    }),
  )

  instance.register(
    async function (i) {
      await i.register(auth)
      i.route(getArtifact)
      i.route(headArtifact)
      i.route(putArtifact)
      i.route(artifactsEvents)
    },
    { prefix: `/${apiVersion}` },
  )

  await instance.register(
    async (i) => {
      i.route(getStatus)
    },
    { prefix: `/${apiVersion}` },
  )
}

export default turboRemoteCache
