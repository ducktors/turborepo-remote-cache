import closeWithGrace from 'close-with-grace'

import { createApp } from './app.js'
import { env, resolveBodyLimit } from './env.js'

const { value: bodyLimit, warning: bodyLimitWarning } = resolveBodyLimit(
  env.get().BODY_LIMIT,
)

const app = createApp({
  trustProxy: true,
  // Default is 1MB
  // https://fastify.dev/docs/latest/Reference/Server/#bodylimit
  bodyLimit,
})

if (bodyLimitWarning) {
  app.log.warn(bodyLimitWarning)
}
app.log.info({ bodyLimit }, 'Server bodyLimit configured')

closeWithGrace(
  { delay: 10000 },
  async function ({ err, signal }: { err?: Error; signal?: string }) {
    if (err) {
      app.log.error(err)
    }

    app.log.info(`[${signal}] Gracefully closing the server instance.`)

    await app.close()
  },
)

app.listen({ host: env.get().HOST, port: env.get().PORT }, (err) => {
  if (err) {
    app.log.error(err)
    process.exit(1)
  }
})
