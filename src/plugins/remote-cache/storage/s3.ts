import s3 from 's3-blob-store'
import aws from 'aws-sdk'

export interface S3Options {
  accessKey?: string
  secretKey?: string
  region?: string
  endpoint?: string
  bucket: string
}
export function createS3({ accessKey, secretKey, bucket, region, endpoint }: S3Options) {
  if (!accessKey || !secretKey || !(region || endpoint)) {
    throw new Error(
      `To use S3 storage "accessKey (S3_ACCESS_KEY)", "secretKey (S3_SECRET_KEY)", and one of "region (S3_REGION)" and "endpoint (S3_ENDPOINT)" parameters are mandatory.`,
    )
  }

  const client = new aws.S3({
    credentials: {
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
    },
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
