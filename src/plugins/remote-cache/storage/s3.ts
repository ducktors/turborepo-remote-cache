import s3 from 's3-blob-store'
import aws from 'aws-sdk'

export interface S3Options {
  accessKey?: string
  secretKey?: string
  bucket: string
}
export function createS3({ accessKey, secretKey, bucket }: S3Options) {
  if (!accessKey || !secretKey) {
    throw new Error(`To use S3 location "accessKey" and "secretKey" parameters are mandatory.`)
  }

  const client = new aws.S3({
    accessKeyId: accessKey,
    secretAccessKey: secretKey,
  })

  const location = s3({
    client,
    bucket,
  })

  return location
}
