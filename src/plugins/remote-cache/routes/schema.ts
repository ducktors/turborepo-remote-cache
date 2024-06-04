import { Static, Type } from '@sinclair/typebox'

const querystring = Type.Object(
  {
    teamId: Type.Optional(Type.String()),
    team: Type.Optional(Type.String()),
    slug: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
)
export type Querystring = Static<typeof querystring>

const params = Type.Object(
  {
    id: Type.String(),
  },
  { additionalProperties: false },
)
export type Params = Static<typeof params>

export const artifactsRouteSchema = {
  querystring,
  params,
}
