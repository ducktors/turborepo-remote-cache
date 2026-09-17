import { randomUUID } from 'node:crypto'
import { Transform, Writable } from 'node:stream'
import { posix as posixPath } from 'path'
import { Readable, pipeline as pipelineCallback } from 'stream'
import { promisify } from 'util'
import { entityTooLarge, notImplemented } from '@hapi/boom'
import { STORAGE_PROVIDERS } from '../../../env.js'
import {
  type AzureBlobStorageOptions as AzureBlobStorageOpts,
  createAzureBlobStorage,
} from './azure-blob-storage.js'
import { cleanStaleLocalArtifacts } from './clean-local.js'
import {
  type GoogleCloudStorageOptions as GCSOpts,
  createGoogleCloudStorage,
} from './google-cloud-storage.js'
import {
  type LocalOptions as LocalOpts,
  createLocal,
  getLocalRootPath,
} from './local.js'
import { type S3Options as S3Opts, createS3 } from './s3.js'

const pipeline = promisify(pipelineCallback)

/**
 * Best-effort cleanup of a temporary artifact key. A failure here must never
 * mask the upload error that triggered the cleanup, so it is swallowed: the
 * leftover is a stale temp key that no lookup path can resolve, not a
 * corrupt cache entry.
 */
async function removeQuietly(
  remove: StorageProvider['remove'],
  artifactPath: string,
): Promise<void> {
  if (!remove) {
    return
  }
  await new Promise<void>((resolve) => {
    remove(artifactPath, () => resolve())
  })
}

const TURBO_CACHE_FOLDER_NAME = 'turborepocache' as const
const TURBO_CACHE_USE_TMP_FOLDER = true as const

/**
 * Builds the storage key for an artifact.
 *
 * Always uses POSIX ('/') separators, regardless of the host OS. These keys are
 * object keys for remote stores (S3/GCS/Azure) and abstract-blob-store paths,
 * not native filesystem paths. Using the platform-dependent `path.join` would
 * emit '\' on Windows, producing keys that artifacts cached by Linux/macOS
 * runners can never resolve (and vice versa). See issue #800.
 */
export function getArtifactPath(team: string, artifactId: string): string {
  return posixPath.join(team, artifactId)
}

/**
 * Builds a passthrough stream that fails with a 413 once more than `maxBytes`
 * have flowed through it. Used to enforce BODY_LIMIT while uploads are streamed
 * to storage, since the request body is no longer buffered (and size-checked)
 * in memory by fastify.
 */
function createSizeLimitStream(maxBytes: number): Transform {
  let received = 0
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length
      if (received > maxBytes) {
        callback(entityTooLarge('Request body is too large'))
        return
      }
      callback(null, chunk)
    },
  })
}

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

/**
 * Raised when an artifact (or its signature tag) genuinely does not exist in
 * the storage backend. Route handlers translate this — and only this — into a
 * 404 cache miss; any other error is a real backend failure and surfaces as a
 * 5xx.
 */
export class ArtifactNotFoundError extends Error {
  constructor(artifactPath: string) {
    super(`Artifact ${artifactPath} doesn't exist.`)
    this.name = 'ArtifactNotFoundError'
  }
}

// https://github.com/maxogden/abstract-blob-store#api
export interface StorageProvider {
  exists: (
    artifactPath: string,
    cb: (err: Error | null, exists?: boolean) => void,
  ) => void
  createReadStream: (artifactPath: string) => Readable
  createWriteStream: (artifactPath: string) => Writable
  /**
   * Atomically publishes an already-written artifact under its final path.
   *
   * Optional: only providers that can promote without re-transferring the
   * payload implement it (currently local, via same-filesystem `rename`).
   * Object stores would need a server-side copy plus a delete, which costs a
   * full extra pass over every artifact, so they opt out and keep writing
   * directly to the final key.
   */
  promote?: (
    fromPath: string,
    toPath: string,
    cb: (err: Error | null) => void,
  ) => void
  remove?: (artifactPath: string, cb: (err: Error | null) => void) => void
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
    return getArtifactPath(team, `${artifactId}.tag`)
  }

  async function getCachedArtifact(artifactId: string, team: string) {
    return new Promise((resolve, reject) => {
      const artifactPath = getArtifactPath(team, artifactId)
      location.exists(artifactPath, (err, exists) => {
        if (err) {
          return reject(err)
        }
        if (!exists) {
          return reject(new ArtifactNotFoundError(artifactPath))
        }
        resolve(location.createReadStream(artifactPath))
      })
    })
  }

  async function existsCachedArtifact(artifactId: string, team: string) {
    return new Promise<void>((resolve, reject) => {
      const artifactPath = getArtifactPath(team, artifactId)
      location.exists(artifactPath, (err, exists) => {
        if (err) {
          return reject(err)
        }
        if (!exists) {
          return reject(new ArtifactNotFoundError(artifactPath))
        }
        resolve()
      })
    })
  }

  async function createCachedArtifact(
    artifactId: string,
    team: string,
    artifact: Readable,
    maxBytes?: number,
  ) {
    const artifactPath = getArtifactPath(team, artifactId)
    const { promote, remove } = location

    // Providers that cannot promote cheaply write straight to the final path.
    if (!promote) {
      return writeArtifactStream(artifactPath, artifact, maxBytes)
    }

    // Stream into a sibling temporary key and publish it only once the whole
    // body has landed. Without this, a mid-upload failure (size-limit breach,
    // client disconnect) leaves a truncated file at the final path, which
    // `exists` then reports as a cache hit and `createReadStream` serves as a
    // valid artifact. The temporary key is removed on failure; the final path
    // is deliberately left untouched, so a failed overwrite cannot destroy an
    // artifact that is already cached.
    const tempPath = `${artifactPath}.${randomUUID()}.tmp`
    try {
      await writeArtifactStream(tempPath, artifact, maxBytes)
    } catch (err) {
      await removeQuietly(remove, tempPath)
      throw err
    }

    try {
      await new Promise<void>((resolve, reject) => {
        promote(tempPath, artifactPath, (err) =>
          err ? reject(err) : resolve(),
        )
      })
    } catch (err) {
      await removeQuietly(remove, tempPath)
      throw err
    }
  }

  async function writeArtifactStream(
    artifactPath: string,
    artifact: Readable,
    maxBytes?: number,
  ) {
    const writeStream = location.createWriteStream(artifactPath)
    if (maxBytes && maxBytes > 0) {
      return pipeline(artifact, createSizeLimitStream(maxBytes), writeStream)
    }
    return pipeline(artifact, writeStream)
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
          return reject(new ArtifactNotFoundError(tagPath))
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
          return reject(new ArtifactNotFoundError(tagPath))
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

  async function cleanStaleArtifacts(team: string, olderThanDays: number) {
    if (provider !== STORAGE_PROVIDERS.LOCAL) {
      throw notImplemented(
        'Clean is only supported for the local storage provider',
      )
    }

    const {
      path = TURBO_CACHE_FOLDER_NAME,
      useTmp = TURBO_CACHE_USE_TMP_FOLDER,
    } = providerOptions

    return cleanStaleLocalArtifacts(
      getLocalRootPath({ path, useTmp }),
      team,
      olderThanDays,
    )
  }

  return {
    getCachedArtifact,
    createCachedArtifact,
    existsCachedArtifact,
    getCachedArtifactTag,
    existsCachedArtifactTag,
    createCachedArtifactTag,
    cleanStaleArtifacts,
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
      cleanStaleArtifacts: ReturnType<
        typeof createLocation
      >['cleanStaleArtifacts']
    }
  }
}
