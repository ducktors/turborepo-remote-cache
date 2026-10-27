import { once } from 'node:events'
import { type File, Storage } from '@google-cloud/storage'
import { ArtifactNotFoundError, type StorageProvider } from './index.js'

export interface GoogleCloudStorageOptions {
  bucket: string
  projectId: string
  clientEmail: string
  privateKey: string
}

function createStorage({ clientEmail, privateKey, projectId }) {
  const retryOptions = { maxRetries: 3, totalTimeout: 240, maxRetryDelay: 30 }
  if (!clientEmail || !privateKey || !projectId) {
    return new Storage({ retryOptions })
  } else {
    return new Storage({
      retryOptions,
      projectId,
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
      },
    })
  }
}

function configureUpload(file: File, signal?: AbortSignal) {
  file.interceptors.push({
    request: (options) => ({
      ...options,
      uri: 'uri' in options ? options.uri : options.url,
      timeout: 60_000,
      signal,
    }),
  })
  return file
}

export function createGoogleCloudStorage({
  bucket,
  clientEmail,
  privateKey,
  projectId,
}: GoogleCloudStorageOptions): StorageProvider {
  const storage = createStorage({
    clientEmail,
    privateKey,
    projectId,
  })

  const turboBucket = storage.bucket(bucket)

  function storageError(error: unknown, artifactPath: string) {
    return (error as { code?: number }).code === 404
      ? new ArtifactNotFoundError(artifactPath)
      : error
  }

  return {
    artifacts: {
      createWriteStream(artifactPath, tag, options) {
        return configureUpload(
          turboBucket.file(artifactPath),
          options?.signal,
        ).createWriteStream({
          metadata: {
            metadata: tag ? { 'artifact-tag': tag } : {},
          },
        })
      },
      async getSnapshot(artifactPath) {
        const [metadata] = await turboBucket
          .file(artifactPath)
          .getMetadata()
          .catch((error) => {
            throw storageError(error, artifactPath)
          })
        if (!metadata.generation) {
          throw new Error('GCS artifact metadata is missing its generation')
        }
        const file = turboBucket.file(artifactPath)
        file.interceptors.push({
          request: (options) => ({
            ...options,
            uri: 'uri' in options ? options.uri : options.url,
            qs: { ...options.qs, generation: metadata.generation },
          }),
        })
        return {
          tag: metadata.metadata?.['artifact-tag'] as string | undefined,
          open: async () => {
            const stream = file.createReadStream()
            try {
              await once(stream, 'readable')
            } catch (error) {
              throw storageError(error, artifactPath)
            }
            return stream
          },
        }
      },
    },
    exists: (artifactPath, cb) => {
      turboBucket.file(artifactPath).exists(cb)
    },
    createReadStream(artifactPath) {
      return turboBucket
        .file(artifactPath)
        .createReadStream() as NodeJS.ReadStream
    },
    // Destroying the SDK writable stops local work. A completed remote write
    // may still win a lost-ack race; cancellation is not publication rollback.
    createWriteStream(artifactPath, options) {
      return configureUpload(
        turboBucket.file(artifactPath),
        options?.signal,
      ).createWriteStream()
    },
  }
}
