import s3 from 's3-blob-store'
import aws from 'aws-sdk'

export interface S3Options {
  endpoint?: string
  bucket: string
}
export function createS3({ bucket, endpoint }: S3Options) {
  const client = new aws.S3({
    ...(endpoint ? { endpoint: new aws.Endpoint(endpoint) } : {}),
    ...(process.env.NODE_ENV === 'test' ? { sslEnabled: false, s3ForcePathStyle: true } : {}),
  })

  const location = s3({
    client,
    bucket,
  })

  return location
}
