import awsLambdaFastify from '@fastify/aws-lambda'
import { createApp } from './app'

const app = createApp({
  trustProxy: true,
})

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const handler = awsLambdaFastify(app, { enforceBase64: _ => true })
