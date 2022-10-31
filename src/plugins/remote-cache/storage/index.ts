import { join } from 'path'
import { Readable, pipeline as pipelineCallback } from 'stream'
import { promisify } from 'util'
import { STORAGE_PROVIDERS } from '../../../env'
import { createS3, type S3Options as S3Opts } from './s3'
import { createLocal, type LocalOptions as LocalOpts } from './local'
import {
  createGoogleCloudStorage,
  type GoogleCloudStorageOptions as GCSOpts,
} from './google-cloud-storage'

const pipeline = promisify(pipelineCallback)
const TURBO_CACHE_FOLDER_NAME = 'turborepocache' as const

type LocalOptions = Partial<LocalOpts>
type S3Options = Omit<S3Opts, 'bucket'> & LocalOptions
type GoogleCloudStorageOptions = Omit<GCSOpts, 'bucket'> & LocalOptions

type ProviderOptions<Provider extends STORAGE_PROVIDERS> = Provider extends STORAGE_PROVIDERS.LOCAL
  ? LocalOptions
  : Provider extends STORAGE_PROVIDERS.S3
  ? S3Options
  : Provider extends STORAGE_PROVIDERS.s3
  ? S3Options
  : Provider extends STORAGE_PROVIDERS.GOOGLE_CLOUD_STORAGE
  ? GoogleCloudStorageOptions
  : never

// https://github.com/maxogden/abstract-blob-store#api
export interface StorageProvider {
  exists: (artifactPath: string, cb: (err: Error | null, exists?: boolean) => void) => void
  createReadStream: (artifactPath: string) => NodeJS.ReadStream
  createWriteStream: (artifactPath: string) => NodeJS.WritableStream
}

function createStorageLocation<Provider extends STORAGE_PROVIDERS>(
  provider: Provider,
  providerOptions: ProviderOptions<Provider>,
): StorageProvider {
  const { path = TURBO_CACHE_FOLDER_NAME } = providerOptions

  switch (provider) {
    case STORAGE_PROVIDERS.LOCAL: {
      return createLocal({ path })
    }
    case STORAGE_PROVIDERS.S3:
    case STORAGE_PROVIDERS.s3: {
      const { accessKey, secretKey, region, endpoint } = providerOptions as S3Options
      return createS3({ accessKey, secretKey, bucket: path, region, endpoint })
    }
    case STORAGE_PROVIDERS.GOOGLE_CLOUD_STORAGE: {
      const { clientEmail, privateKey, projectId, useApplicationDefaultCredentials } =
        providerOptions as GoogleCloudStorageOptions
      return createGoogleCloudStorage({
        bucket: path,
        clientEmail,
        privateKey,
        projectId,
        useApplicationDefaultCredentials,
      })
    }
    default:
      throw new Error(
        `Unsupported storage provider '${provider}'. Please select one of the following: ${Object.values(
          STORAGE_PROVIDERS,
        ).join(', ')}!`,
      )
  }
}

export function createLocation<Provider extends STORAGE_PROVIDERS>(
  provider: Provider,
  providerOptions: ProviderOptions<Provider>,
) {
  const location = createStorageLocation(provider, providerOptions)

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

  async function existsCachedArtifact(artifactId: string, teamId: string) {
    return new Promise<void>((resolve, reject) => {
      const artifactPath = join(teamId, artifactId)
      location.exists(artifactPath, (err, exists) => {
        if (err) {
          return reject(err)
        }
        if (!exists) {
          return reject(new Error(`Artifact ${artifactPath} doesn't exist.`))
        }
        resolve()
      })
    })
  }

  async function createCachedArtifact(artifactId: string, teamId: string, artifact: Readable) {
    return pipeline(artifact, location.createWriteStream(join(teamId, artifactId)))
  }

  return {
    getCachedArtifact,
    createCachedArtifact,
    existsCachedArtifact,
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    location: {
      existsCachedArtifact: ReturnType<typeof createLocation>['existsCachedArtifact']
      getCachedArtifact: ReturnType<typeof createLocation>['getCachedArtifact']
      createCachedArtifact: ReturnType<typeof createLocation>['createCachedArtifact']
    }
  }
}
