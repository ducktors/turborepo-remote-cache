import 'make-promises-safe'
import hyperid from 'hyperid'
import closeWithGrace from 'close-with-grace'

import { createApp } from './app'
import { logger } from './logger'

const uuid = hyperid({ urlSafe: true })

const app = createApp({
  trustProxy: true,
  logger,
  genReqId: () => uuid(),
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

app.listen(Number(process.env.PORT), '0.0.0.0', err => {
  if (err) {
    app.log.error(err)
    process.exit(1)
  }

  app.log.info(`Server listening on port ${app.config.PORT}`)
  app.log.info(app.printRoutes())
})
