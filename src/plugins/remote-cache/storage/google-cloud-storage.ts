import { StorageProvider } from './index'
import { Storage } from '@google-cloud/storage'

export interface GoogleCloudStorageOptions {
  bucket: string
  projectId: string
  clientEmail: string
  privateKey: string
  useApplicationDefaultCredentials: boolean
}

function createStorage({
  clientEmail,
  privateKey,
  projectId,
  useApplicationDefaultCredentials,
}: Omit<GoogleCloudStorageOptions, 'bucket'>): Storage {
  if (useApplicationDefaultCredentials) {
    return new Storage()
  } else if (!clientEmail || !privateKey || !projectId) {
    throw new Error(
      `To use Google Cloud Storage "clientEmail (GCS_CLIENT_EMAIL)", "privateKey (GCS_PRIVATE_KEY)" and "projectId (GCS_PROJECT_ID)" parameters are mandatory.`,
    )
  }
  return new Storage({
    projectId,
    credentials: {
      client_email: clientEmail,
      private_key: privateKey,
    },
  })
}

export function createGoogleCloudStorage({
  bucket,
  clientEmail,
  privateKey,
  projectId,
  useApplicationDefaultCredentials,
}: GoogleCloudStorageOptions): StorageProvider {
  const storage = createStorage({
    clientEmail,
    privateKey,
    projectId,
    useApplicationDefaultCredentials,
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
