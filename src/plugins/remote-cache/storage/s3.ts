import s3 from 's3-blob-store'
import aws from 'aws-sdk'

export interface S3Options {
  accessKey?: string
  secretKey?: string
  region?: string
  endpoint?: string
  bucket: string
}

// AWS_ envs are default for aws-sdk
export function createS3({
  accessKey = process.env.AWS_ACCESS_KEY_ID,
  secretKey = process.env.AWS_SECRET_ACCESS_KEY,
  bucket,
  region = process.env.AWS_REGION,
  endpoint,
}: S3Options) {
  const client = new aws.S3({
    ...(accessKey && secretKey
      ? {
          credentials: {
            accessKeyId: accessKey,
            secretAccessKey: secretKey,
          },
        }
      : {}),
    ...(region ? { region } : {}),
    ...(endpoint ? { endpoint: new aws.Endpoint(endpoint) } : {}),
    ...(process.env.NODE_ENV === 'test' ? { sslEnabled: false, s3ForcePathStyle: true } : {}),
  })

  const location = s3({
    client,
    bucket,
  })

  return location
}
