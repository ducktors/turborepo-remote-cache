import { PassThrough, Writable } from 'node:stream'
import { Readable } from 'node:stream'
import {
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
  S3ClientConfig,
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { StorageProvider } from './index.js'

export interface S3Options {
  accessKey?: string
  secretKey?: string
  region?: string
  endpoint?: string
  bucket: string
  maxSockets?: number
  s3OptionsPassthrough?: S3ClientConfig
}

// AWS_ envs are default for aws-sdk
export function createS3({
  accessKey = process.env.S3_ACCESS_KEY,
  secretKey = process.env.S3_SECRET_KEY,
  bucket,
  region = process.env.S3_REGION,
  endpoint,
  maxSockets,
  s3OptionsPassthrough = {},
}: S3Options): StorageProvider {
  if (!bucket) {
    throw new Error(
      'S3 bucket is required; please set the STORAGE_PATH environment variable to the bucket name',
    )
  }

  const client = new S3Client({
    credentials:
      accessKey && secretKey
        ? {
            accessKeyId: accessKey,
            secretAccessKey: secretKey,
          }
        : undefined,
    region,
    endpoint,
    ...(maxSockets
      ? {
          requestHandler: {
            httpsAgent: { maxSockets },
          },
        }
      : {}),
    ...(process.env.NODE_ENV === 'test'
      ? { sslEnabled: false, s3ForcePathStyle: true }
      : {}),
    ...s3OptionsPassthrough,
  })

  return {
    exists: async (key, cb) => {
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
        return cb(null, true)
      } catch (error) {
        return cb(null, false)
      }
    },
    createReadStream: (key: string) => {
      const passThrough = new PassThrough()
      client
        .send(new GetObjectCommand({ Bucket: bucket, Key: key }))
        .then((data) => {
          if (data.Body) {
            if (data.Body instanceof Readable) {
              data.Body.pipe(passThrough)
            } else {
              const stream = Readable.from(
                data.Body as AsyncIterable<Uint8Array>,
              )
              stream.pipe(passThrough)
            }
          }
        })
        .catch((err) => passThrough.destroy(err))
      return passThrough
    },
    createWriteStream: (key: string) => {
      const passThrough = new PassThrough()
      const upload = new Upload({
        client,
        params: { Bucket: bucket, Key: key, Body: passThrough },
      })

      const uploadPromise = upload.done()

      const writeStream = new Writable({
        write(chunk, encoding, callback) {
          passThrough.write(chunk, encoding, callback)
        },
        final(callback) {
          passThrough.end()
          uploadPromise.then(() => callback()).catch(callback)
        },
      })

      return writeStream
    },
  }
}
