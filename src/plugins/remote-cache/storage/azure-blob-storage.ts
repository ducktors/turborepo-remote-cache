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
      blobClient.download().then((response) => {
        if (response.readableStreamBody) {
          response.readableStreamBody.pipe(stream)
        }
      })
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
