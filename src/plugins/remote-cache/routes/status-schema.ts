import { Static, Type } from '@sinclair/typebox'

const querystring = Type.Object({}, { additionalProperties: false })
export type Querystring = Static<typeof querystring>

const params = Type.Object({}, { additionalProperties: false })
export type Params = Static<typeof params>

export const statusRouteSchema = {
  querystring,
  params,
}
