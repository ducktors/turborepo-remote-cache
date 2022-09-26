import { join } from 'path'
import { test } from 'tap'
import dotenv from 'dotenv'
dotenv.config({ path: join(__dirname, '.env.vercel') })

import vercel from '../src/vercel'

test('vercel', t1 => {
  t1.test('should boot with no errors', async t2 => {
    t2.rejects(
      // @ts-expect-error -- we are interested only in testing the boot phase
      vercel({}, {}),
      `Cannot read properties of undefined (reading 'length')`,
    )
    t2.end()
  })
  t1.end()
})
