import 'make-promises-safe'
import closeWithGrace from 'close-with-grace'

import { createApp } from './app'
import { env } from './env'

const app = createApp({
  trustProxy: true,
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

app.listen(env.PORT, '0.0.0.0', err => {
  if (err) {
    app.log.error(err)
    process.exit(1)
  }
})
