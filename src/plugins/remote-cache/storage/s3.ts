import s3 from 's3-blob-store'
import aws from 'aws-sdk'
import { CredentialsOptions } from 'aws-sdk/lib/credentials'

export interface S3Options {
  accessKey?: string
  secretKey?: string
  sessionToken?: string
  region?: string
  endpoint?: string
  bucket: string
}

// AWS_ envs are default for aws-sdk
export function createS3({
  accessKey = process.env.AWS_ACCESS_KEY_ID,
  secretKey = process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken = process.env.AWS_SESSION_TOKEN,
  bucket,
  region = process.env.AWS_REGION,
  endpoint,
}: S3Options) {
  if (!accessKey || !secretKey || !(region || endpoint)) {
    throw new Error(
      `To use S3 storage "accessKey (S3_ACCESS_KEY)", "secretKey (S3_SECRET_KEY)", and one of "region (S3_REGION)" and "endpoint (S3_ENDPOINT)" parameters are mandatory.`,
    )
  }

  const credentials: CredentialsOptions = {
    accessKeyId: accessKey,
    secretAccessKey: secretKey,
  }

  if (sessionToken) {
    credentials.sessionToken = sessionToken
  }

  const client = new aws.S3({
    credentials,
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
