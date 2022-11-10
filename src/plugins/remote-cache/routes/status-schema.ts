import { Static, Type } from '@sinclair/typebox'

const querystring = Type.Object({}, { additionalParameters: false })
export type Querystring = Static<typeof querystring>

const params = Type.Object({}, { additionalParameters: false })
export type Params = Static<typeof params>

export const statusRouteSchema = {
  querystring,
  params,
}
