import 'make-promises-safe'
import closeWithGrace from 'close-with-grace'

import { createApp } from './app'
import { env } from './env'

const app = createApp({
  trustProxy: true,
  bodyLimit: process.env.BODY_LIMIT !== undefined ? Number(process.env.BODY_LIMIT) : undefined,
})

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

app.listen({ host: '0.0.0.0', port: env.PORT }, err => {
  if (err) {
    app.log.error(err)
    process.exit(1)
  }
})
