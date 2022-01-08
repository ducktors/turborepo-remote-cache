import { join } from 'path'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import { STORAGE_PROVIDERS } from '../../../env'
import { createS3, type S3Options } from './s3'
import { createLocal, LocalOptions } from './local'

const TURBO_CACHE_FOLDER_NAME = 'turborepocache' as const

type ProviderOptions = Partial<LocalOptions> & Omit<S3Options, 'bucket'>

export function createLocation(provider: STORAGE_PROVIDERS, providerOptions: ProviderOptions) {
  const { path = TURBO_CACHE_FOLDER_NAME, accessKey, secretKey } = providerOptions
  const location =
    provider === STORAGE_PROVIDERS.LOCAL
      ? createLocal({ path })
      : createS3({ accessKey, secretKey, bucket: path })

  async function getCachedArtifact(artifactId: string, teamId: string) {
    return new Promise((resolve, reject) => {
      const artifactPath = join(teamId, artifactId)
      location.exists(artifactPath, (err, exists) => {
        if (err) {
          return reject(err)
        }
        if (!exists) {
          return reject(new Error(`Artifact ${artifactPath} doesn't exist.`))
        }
        resolve(location.createReadStream(artifactPath))
      })
    })
  }

  async function createCachedArtifact(artifactId: string, teamId: string, artifact: Readable) {
    return pipeline(artifact, location.createWriteStream(join(teamId, artifactId)))
  }
  return {
    getCachedArtifact,
    createCachedArtifact,
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    location: {
      getCachedArtifact: ReturnType<typeof createLocation>['getCachedArtifact']
      createCachedArtifact: ReturnType<typeof createLocation>['createCachedArtifact']
    }
  }
}
