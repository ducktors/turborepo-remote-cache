import { PassThrough, Writable } from 'node:stream'
import { BlobServiceClient } from '@azure/storage-blob'
import { StorageProvider } from './index.js'

export interface AzureBlobStorageOptions {
  containerName: string
  connectionString: string
}

export function createAzureBlobStorage({
  containerName,
  connectionString,
}: AzureBlobStorageOptions): StorageProvider {
  const blobServiceClient =
    BlobServiceClient.fromConnectionString(connectionString)
  const containerClient = blobServiceClient.getContainerClient(containerName)

  return {
    exists: (artifactPath, cb) => {
      const blobClient = containerClient.getBlobClient(artifactPath)
      blobClient.exists().then((exists) => {
        cb(null, exists)
      }, cb)
    },
    createReadStream(artifactPath) {
      const blobClient = containerClient.getBlobClient(artifactPath)
      const stream = new PassThrough()
      blobClient
        .download()
        .then((response) => {
          if (!response.readableStreamBody) {
            throw new Error(
              `Artifact ${artifactPath} download returned no readable body.`,
            )
          }
          // pipe() does not forward errors, so a body that fails partway
          // through (dropped connection) has to be wired through explicitly.
          response.readableStreamBody
            .on('error', (err) => stream.destroy(err))
            .pipe(stream)
        })
        // A real backend failure (network, throttling, 5xx) or a response
        // without a body. Destroy the stream with the error so it surfaces as a
        // 5xx: leaving the rejection unhandled would hang the request and, under
        // Node's default --unhandled-rejections=throw, terminate the process.
        .catch((err) => stream.destroy(err))
      return stream
    },
    createWriteStream(artifactPath) {
      const blockBlobClient = containerClient.getBlockBlobClient(artifactPath)
      const passThrough = new PassThrough()
      const uploadPromise = blockBlobClient.uploadStream(passThrough)
      return new Writable({
        write(chunk, encoding, callback) {
          passThrough.write(chunk, encoding, callback)
        },
        final(callback) {
          passThrough.end()
          uploadPromise.then(() => callback()).catch(callback)
        },
      })
    },
  }
}
