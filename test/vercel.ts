import assert from 'node:assert/strict'
import { test } from 'node:test'

const testEnv = {
  NODE_ENV: 'test',
  PORT: 3000,
  LOG_LEVEL: 'info',
  LOG_MODE: 'stdout',
  LOG_FILE: 'server.log',
  TURBO_TOKEN: ['changeme'],
  STORAGE_PROVIDER: 's3',
  STORAGE_PATH: 'turborepo-remote-cache-test',
  AWS_ACCESS_KEY_ID: 'S3RVER',
  AWS_SECRET_ACCESS_KEY: 'S3RVER',
  AWS_REGION: '',
  S3_ENDPOINT: 'http://localhost:4568',
}
Object.assign(process.env, testEnv)

test('Vercel', async (t) => {
  const { default: vercel } = await import('../src/vercel.js')

  await t.test('boots with no errors', async () => {
    await assert.rejects(
      // @ts-expect-error -- we are interested only in testing the boot phase
      () => vercel({}, {}),

      (err) => {
        if (err instanceof Error) {
          assert.strictEqual(err.name, 'TypeError')
          assert.strictEqual(
            err.message,
            `Cannot read properties of undefined (reading 'accept-version')`,
          )
          return true
        } else {
          return false
        }
      },
    )
  })
})
