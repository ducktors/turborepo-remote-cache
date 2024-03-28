import aws from 'aws-sdk'
import type { S3 } from 'aws-sdk'
import s3 from 's3-blob-store'

export interface S3Options {
  accessKey?: string
  secretKey?: string
  region?: string
  endpoint?: string
  bucket: string
  s3OptionsPassthrough?: S3.ClientConfiguration
}

// AWS_ envs are default for aws-sdk
export function createS3({
  accessKey = process.env.AWS_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY,
  secretKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.S3_SECRET_KEY,
  bucket,
  region = process.env.AWS_REGION || process.env.S3_REGION,
  endpoint,
  s3OptionsPassthrough = {},
}: S3Options) {
  const client = new aws.S3({
    ...(accessKey && secretKey
      ? {
          credentials: {
            accessKeyId: accessKey,
            secretAccessKey: secretKey,
            sessionToken: process.env.AWS_SESSION_TOKEN,
          },
        }
      : {}),
    ...(region ? { region } : {}),
    ...(endpoint ? { endpoint: new aws.Endpoint(endpoint) } : {}),
    ...(process.env.NODE_ENV === 'test'
      ? { sslEnabled: false, s3ForcePathStyle: true }
      : {}),
    ...s3OptionsPassthrough,
  })

  const location = s3({
    client,
    bucket,
  })

  return location
}
