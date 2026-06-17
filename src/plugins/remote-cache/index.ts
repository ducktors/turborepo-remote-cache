import { FastifyInstance } from 'fastify'
import { STORAGE_PROVIDERS, resolveBodyLimit } from '../../env.js'
import auth from './auth/index.js'
import {
  artifactsEvents,
  cleanCache,
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
  const { warning: bodyLimitWarning } = resolveBodyLimit(
    instance.config.BODY_LIMIT,
  )
  if (bodyLimitWarning) {
    instance.log.warn(bodyLimitWarning)
  }
  const { apiVersion = 'v8', provider = STORAGE_PROVIDERS.LOCAL } = options

  // Stream the upload body straight through to storage instead of buffering the
  // whole request into the heap. A custom parser without `parseAs` receives the
  // raw request stream as `payload`, so we hand it to the route untouched. The
  // BODY_LIMIT is enforced while streaming (see `put-artifact` and
  // `createCachedArtifact`) because Fastify only auto-enforces it for `parseAs`
  // parsers. See https://github.com/ducktors/turborepo-remote-cache/issues/679
  instance.addContentTypeParser(
    'application/octet-stream',
    (_request, payload, done) => {
      done(null, payload)
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
      maxSockets: instance.config.S3_MAX_SOCKETS,
    }),
  )

  instance.register(
    async function (i) {
      await i.register(auth)
      i.route(getArtifact)
      i.route(headArtifact)
      i.route(putArtifact)
      i.route(artifactsEvents)
      i.route(cleanCache)
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
