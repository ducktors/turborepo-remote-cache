import closeWithGrace from 'close-with-grace'

import { createApp } from './app.js'
import { env } from './env.js'

const app = createApp({
  trustProxy: true,
  // Default is 1MB
  // https://fastify.dev/docs/latest/Reference/Server/#bodylimit
  bodyLimit: env.get().BODY_LIMIT,
})

closeWithGrace(
  { delay: 10000 },
  async ({ err, signal }: { err?: Error; signal?: string }) => {
    if (err) {
      app.log.error(err)
    }

    app.log.info(`[${signal}] Gracefully closing the server instance.`)

    await app.close()
  },
)

app.listen({ host: '0.0.0.0', port: env.get().PORT }, (err) => {
  if (err) {
    app.log.error(err)
    process.exit(1)
  }
})
