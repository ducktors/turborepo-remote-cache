import { StorageProvider } from './index'
import { Storage } from '@google-cloud/storage'

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

  return {
    exists: (artifactPath, cb) => {
      turboBucket.file(artifactPath).exists(cb)
    },
    createReadStream(artifactPath) {
      return turboBucket.file(artifactPath).createReadStream() as NodeJS.ReadStream
    },
    createWriteStream(artifactPath) {
      return turboBucket.file(artifactPath).createWriteStream()
    },
  }
}
