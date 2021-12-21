import Ajv from 'ajv'
import envSchema from 'env-schema'
import { Type, Static } from '@sinclair/typebox'

export enum NODE_ENVS {
  PRODUCTION = 'production',
  DEVELOPMENT = 'development',
}

const schema = Type.Object(
  {
    PORT: Type.Number({ default: 3000 }),
    NODE_ENV: Type.Enum(NODE_ENVS),
    NOLOG: Type.Optional(Type.Boolean()),
    LOG_LEVEL: Type.Optional(Type.String()),
    PRETTY_LOGS: Type.Optional(Type.String()),
    TOKEN: Type.String(),
  },
  { additionalProperties: false },
)

export const env = envSchema<Static<typeof schema>>({
  ajv: new Ajv({
    removeAdditional: true,
    useDefaults: true,
    coerceTypes: true,
    keywords: ['kind', 'RegExp', 'modifier'],
  }),
  dotenv: process.env.NODE_ENV === NODE_ENVS.DEVELOPMENT ? true : false,
  schema,
})
