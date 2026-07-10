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

/**
 * Whether an S3 SDK error should be treated as a cache miss (the object isn't
 * available) rather than a real backend failure (throttling, network, 5xx).
 *
 * A missing object normally surfaces as 404 (`NotFound` for HeadObject,
 * `NoSuchKey` for GetObject). However, S3 returns **403** for a missing object
 * when the caller's IAM policy lacks `s3:ListBucket` — a common least-privilege
 * setup where only `GetObject`/`PutObject` are granted. In that configuration
 * every cache miss is a 403, so 403 must be treated as a miss too; otherwise
 * every miss would become a 5xx.
 *
 * Everything else — 5xx, throttling (`SlowDown`), timeouts, connection errors —
 * is a genuine backend failure and must NOT be masked as a miss, so it surfaces
 * as a 5xx instead of silently degrading the cache hit rate.
 */
export function isCacheMissError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }
  const err = error as {
    name?: string
    Code?: string
    $metadata?: { httpStatusCode?: number }
  }
  const statusCode = err.$metadata?.httpStatusCode
  return (
    err.name === 'NotFound' ||
    err.name === 'NoSuchKey' ||
    err.Code === 'NoSuchKey' ||
    statusCode === 404 ||
    statusCode === 403
  )
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
        if (isCacheMissError(error)) {
          return cb(null, false)
        }
        // A real backend failure (throttling, network, 5xx). Propagate it
        // instead of reporting a cache miss, so it surfaces as a 5xx.
        return cb(error as Error)
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
