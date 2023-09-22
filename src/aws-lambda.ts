import awsLambdaFastify from '@fastify/aws-lambda'
import { createApp } from './app.js'

const app = createApp({
  trustProxy: true,
})

export const handler = awsLambdaFastify(app, { enforceBase64: (_) => true })
