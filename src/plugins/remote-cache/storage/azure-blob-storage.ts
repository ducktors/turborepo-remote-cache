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
      const controller = new AbortController()
      // `undefined` keeps the SDK defaults for the block size and concurrency.
      const uploadPromise = blockBlobClient.uploadStream(
        passThrough,
        undefined,
        undefined,
        { abortSignal: controller.signal },
      )
      let completed = false

      const writeStream = new Writable({
        write(chunk, encoding, callback) {
          passThrough.write(chunk, encoding, callback)
        },
        final(callback) {
          passThrough.end()
          uploadPromise
            .then(() => {
              completed = true
              callback()
            })
            .catch(callback)
        },
        /**
         * `pipeline()` destroys the destination when an upstream stage fails
         * (for example, when the BODY_LIMIT transform rejects an oversized
         * upload), and destruction skips `final()`. `autoDestroy` also calls
         * this method after a successful upload. In that case, only forward
         * the error.
         */
        destroy(err, callback) {
          if (completed) {
            callback(err)
            return
          }
          // The SDK reads the PassThrough through its `data`, `end` and `error`
          // events only. Without an error, the upload promise never settles
          // and keeps its buffers in memory.
          passThrough.destroy(err ?? new Error('Upload aborted'))
          // The signal cancels a block list commit that is in progress. Do not
          // wait for remote work here: that delays `pipeline()` and the HTTP
          // response.
          controller.abort()
          callback(err)
        },
      })

      // When a block upload fails, the SDK pauses the PassThrough. A pending
      // `write()` then never calls back, so `pipeline()` stalls. Destroy the
      // writable with the upload error to fail the request. Attach this
      // handler at creation time, so the rejection after `destroy()` is not
      // unhandled. A destroyed writable ignores the second `destroy()` call.
      uploadPromise.catch((err) => writeStream.destroy(err))

      return writeStream
    },
  }
}
