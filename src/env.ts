import Ajv from 'ajv'
import envSchema from 'env-schema'
import { Type, Static } from '@sinclair/typebox'

enum NODE_ENVS {
  PRODUCTION = 'production',
  DEVELOPMENT = 'development',
  TEST = 'test',
}

export enum STORAGE_PROVIDERS {
  LOCAL = 'local',
  S3 = 'S3',
  s3 = 's3',
}

const schema = Type.Object(
  {
    NODE_ENV: Type.Optional(Type.Enum(NODE_ENVS, { default: NODE_ENVS.PRODUCTION })),
    TURBO_TOKEN: Type.String({ separator: ',' }),
    PORT: Type.Number({ default: 3000 }),
    LOG_LEVEL: Type.Optional(Type.String({ default: 'info' })),
    STORAGE_PROVIDER: Type.Optional(
      Type.Enum(STORAGE_PROVIDERS, { default: STORAGE_PROVIDERS.LOCAL }),
    ),
    STORAGE_PATH: Type.Optional(Type.String()),
    // AWS_ env vars are used as aws-sdk defaults
    AWS_ACCESS_KEY_ID: Type.Optional(Type.String()),
    AWS_SECRET_ACCESS_KEY: Type.Optional(Type.String()),
    AWS_SESSION_TOKEN: Type.Optional(Type.String()),
    AWS_REGION: Type.Optional(Type.String()),
    // S3_ env vars are used by Vercel. ref: https://vercel.com/support/articles/how-can-i-use-aws-sdk-environment-variables-on-vercel
    S3_ACCESS_KEY: Type.Optional(Type.String()),
    S3_SECRET_KEY: Type.Optional(Type.String()),
    S3_REGION: Type.Optional(Type.String()),
    // S3_ENDPOINT is shared between are deployments type
    S3_ENDPOINT: Type.Optional(Type.String()),
  },
  {
    additionalProperties: false,
  },
)
export const env = envSchema<Static<typeof schema>>({
  ajv: new Ajv({
    removeAdditional: true,
    useDefaults: true,
    coerceTypes: true,
    keywords: ['kind', 'RegExp', 'modifier', envSchema.keywords.separator],
  }),
  dotenv: process.env.NODE_ENV === NODE_ENVS.DEVELOPMENT ? true : false,
  schema,
})
