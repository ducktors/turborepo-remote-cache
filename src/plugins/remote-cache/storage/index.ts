import { Writable } from 'node:stream'
import { join } from 'path'
import { Readable, pipeline as pipelineCallback } from 'stream'
import { promisify } from 'util'
import { STORAGE_PROVIDERS } from '../../../env.js'
import {
  type AzureBlobStorageOptions as AzureBlobStorageOpts,
  createAzureBlobStorage,
} from './azure-blob-storage.js'
import {
  type GoogleCloudStorageOptions as GCSOpts,
  createGoogleCloudStorage,
} from './google-cloud-storage.js'
import { type LocalOptions as LocalOpts, createLocal } from './local.js'
import { type S3Options as S3Opts, createS3 } from './s3.js'

const pipeline = promisify(pipelineCallback)
const TURBO_CACHE_FOLDER_NAME = 'turborepocache' as const
const TURBO_CACHE_USE_TMP_FOLDER = true as const

type LocalOptions = Partial<LocalOpts>
type S3Options = Omit<S3Opts, 'bucket'> & LocalOptions
type GoogleCloudStorageOptions = Omit<GCSOpts, 'bucket'> & LocalOptions
type AzureBlobStorageOptions = Omit<AzureBlobStorageOpts, 'bucket'> &
  LocalOptions

type ProviderOptions<Provider extends STORAGE_PROVIDERS> =
  Provider extends typeof STORAGE_PROVIDERS.LOCAL
    ? LocalOptions
    : Provider extends typeof STORAGE_PROVIDERS.S3
    ? S3Options
    : Provider extends typeof STORAGE_PROVIDERS.AZURE_BLOB_STORAGE
    ? AzureBlobStorageOptions
    : Provider extends typeof STORAGE_PROVIDERS.GOOGLE_CLOUD_STORAGE
    ? GoogleCloudStorageOptions
    : never

// https://github.com/maxogden/abstract-blob-store#api
export interface StorageProvider {
  exists: (
    artifactPath: string,
    cb: (err: Error | null, exists?: boolean) => void,
  ) => void
  createReadStream: (artifactPath: string) => Readable
  createWriteStream: (artifactPath: string) => Writable
}

function createStorageLocation<Provider extends STORAGE_PROVIDERS>(
  provider: Provider,
  providerOptions: ProviderOptions<Provider>,
): StorageProvider {
  const {
    path = TURBO_CACHE_FOLDER_NAME,
    useTmp = TURBO_CACHE_USE_TMP_FOLDER,
  } = providerOptions

  switch (provider) {
    case STORAGE_PROVIDERS.LOCAL: {
      return createLocal({ path, useTmp })
    }
    case STORAGE_PROVIDERS.S3:
    case STORAGE_PROVIDERS.s3: {
      const { accessKey, secretKey, region, endpoint, maxSockets } =
        providerOptions as S3Options
      return createS3({
        accessKey,
        secretKey,
        bucket: path,
        region,
        endpoint,
        maxSockets,
        s3OptionsPassthrough: {
          forcePathStyle: true,
        },
      })
    }
    case STORAGE_PROVIDERS.MINIO: {
      const { accessKey, secretKey, region, endpoint, maxSockets } =
        providerOptions as S3Options
      return createS3({
        accessKey,
        secretKey,
        bucket: path,
        region,
        endpoint,
        maxSockets,
        s3OptionsPassthrough: {
          forcePathStyle: true,
        },
      })
    }
    case STORAGE_PROVIDERS.GOOGLE_CLOUD_STORAGE: {
      const { clientEmail, privateKey, projectId } =
        providerOptions as GoogleCloudStorageOptions
      return createGoogleCloudStorage({
        bucket: path,
        clientEmail,
        privateKey,
        projectId,
      })
    }
    case STORAGE_PROVIDERS.AZURE_BLOB_STORAGE: {
      const { connectionString } = providerOptions as AzureBlobStorageOptions
      return createAzureBlobStorage({ containerName: path, connectionString })
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

  function getArtifactTagPath(artifactId: string, team: string): string {
    return join(team, `${artifactId}.tag`)
  }

  async function getCachedArtifact(artifactId: string, team: string) {
    return new Promise((resolve, reject) => {
      const artifactPath = join(team, artifactId)
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

  async function existsCachedArtifact(artifactId: string, team: string) {
    return new Promise<void>((resolve, reject) => {
      const artifactPath = join(team, artifactId)
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

  async function createCachedArtifact(
    artifactId: string,
    team: string,
    artifact: Readable,
  ) {
    return pipeline(
      artifact,
      location.createWriteStream(join(team, artifactId)),
    )
  }

  async function getCachedArtifactTag(
    artifactId: string,
    team: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const tagPath = getArtifactTagPath(artifactId, team)
      location.exists(tagPath, (err, exists) => {
        if (err) {
          return reject(err)
        }
        if (!exists) {
          return reject(new Error(`Artifact tag ${tagPath} doesn't exist.`))
        }
        const stream = location.createReadStream(tagPath)
        const chunks: Buffer[] = []
        stream.on('data', (chunk: Buffer) => chunks.push(chunk))
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
        stream.on('error', reject)
      })
    })
  }

  async function existsCachedArtifactTag(
    artifactId: string,
    team: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const tagPath = getArtifactTagPath(artifactId, team)
      location.exists(tagPath, (err, exists) => {
        if (err) {
          return reject(err)
        }
        if (!exists) {
          return reject(new Error(`Artifact tag ${tagPath} doesn't exist.`))
        }
        resolve()
      })
    })
  }

  async function createCachedArtifactTag(
    artifactId: string,
    team: string,
    tag: string,
  ): Promise<void> {
    return pipeline(
      Readable.from(tag),
      location.createWriteStream(getArtifactTagPath(artifactId, team)),
    )
  }

  return {
    getCachedArtifact,
    createCachedArtifact,
    existsCachedArtifact,
    getCachedArtifactTag,
    existsCachedArtifactTag,
    createCachedArtifactTag,
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    location: {
      existsCachedArtifact: ReturnType<
        typeof createLocation
      >['existsCachedArtifact']
      getCachedArtifact: ReturnType<typeof createLocation>['getCachedArtifact']
      createCachedArtifact: ReturnType<
        typeof createLocation
      >['createCachedArtifact']
      getCachedArtifactTag: ReturnType<
        typeof createLocation
      >['getCachedArtifactTag']
      existsCachedArtifactTag: ReturnType<
        typeof createLocation
      >['existsCachedArtifactTag']
      createCachedArtifactTag: ReturnType<
        typeof createLocation
      >['createCachedArtifactTag']
    }
  }
}
