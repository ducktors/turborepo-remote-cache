import { Storage } from '@google-cloud/storage'
import { ArtifactNotFoundError, type StorageProvider } from './index.js'

export interface GoogleCloudStorageOptions {
  bucket: string
  projectId: string
  clientEmail: string
  privateKey: string
}

function createStorage({ clientEmail, privateKey, projectId }) {
  if (!clientEmail || !privateKey || !projectId) {
    return new Storage()
  } else {
    return new Storage({
      projectId,
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
      },
    })
  }
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
      createWriteStream(artifactPath, tag) {
        return turboBucket.file(artifactPath).createWriteStream({
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
              await new Promise<void>((resolve, reject) => {
                // once() rejects only on 'error'. A stream that closes without
                // an error must also end the wait.
                const settle = (error?: unknown) => {
                  stream.off('readable', onReadable)
                  stream.off('error', settle)
                  stream.off('close', onClose)
                  error ? reject(error) : resolve()
                }
                const onReadable = () => settle()
                const onClose = () =>
                  settle(new Error(`GCS read of ${artifactPath} closed early`))
                stream.once('readable', onReadable)
                stream.once('error', settle)
                stream.once('close', onClose)
              })
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
    // No destroy handler is necessary. The SDK destroys its internal upload
    // pipeline when this writable closes, so an unfinished upload never
    // becomes a visible object.
    createWriteStream(artifactPath) {
      return turboBucket.file(artifactPath).createWriteStream()
    },
  }
}
