import { join } from 'path'
import dotenv from 'dotenv'
dotenv.config({ path: join(__dirname, '.env.multipletokens') })
import { test } from 'tap'
import { createApp } from '../src/app'

test(`should return array with multiple tokens`, async t => {
  t.plan(2)
  const app = createApp({ logger: false })
  await app.ready()
  t.type(app.config.TURBO_TOKEN, Array)
  t.same(app.config.TURBO_TOKEN, ['changeme', 'changeme2', 'changeme3'])
})
