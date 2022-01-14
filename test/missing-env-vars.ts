import { join } from 'path'
import dotenv from 'dotenv'
dotenv.config({ path: join(__dirname, '.env.missing') })
import { test } from 'tap'
import { createApp } from '../src/app'

test(`should throw without mandatory env vars'`, async t => {
  t.plan(1)
  const app = createApp({ logger: false })
  t.rejects(async () => await app.ready())
})
