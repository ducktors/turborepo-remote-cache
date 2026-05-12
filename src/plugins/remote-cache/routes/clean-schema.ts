import { Static, Type } from '@sinclair/typebox'

const DEFAULT_OLDER_THAN_DAYS = 10

const querystring = Type.Object(
  {
    slug: Type.String({ minLength: 1 }),
    olderThan: Type.Optional(Type.Integer({ minimum: 1 })),
  },
  { additionalProperties: false },
)
export type Querystring = Static<typeof querystring>

export const cleanRouteSchema = {
  querystring,
}

export { DEFAULT_OLDER_THAN_DAYS }
