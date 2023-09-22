import assert from 'node:assert/strict'
import { test } from 'node:test'

const testEnv = {
  NODE_ENV: 'test',
  PORT: 3000,
  LOG_LEVEL: 'info',
  LOG_MODE: 'stdout',
  LOG_FILE: 'server.log',
  TURBO_TOKEN: 'changeme',
  STORAGE_PROVIDER: 's3',
  STORAGE_PATH: '',
  AWS_ACCESS_KEY_ID: 'S3RVER',
  AWS_SECRET_ACCESS_KEY: 'S3RVER',
  AWS_REGION: '',
  S3_ENDPOINT: '',
}
test('should throw without mandatory env vars', async (t) => {
  /**
   * MOCKS
   */
  Object.assign(process.env, testEnv)
  const { env } = await import('../src/env.js')
  t.mock.method(env, 'get', () => {
    return testEnv
  })
  /**
   * END MOCKS
   */
  const { createApp } = await import('../src/app.js')
  const app = createApp({ logger: false })

  await assert.rejects(
    async () => await app.ready(),
    (err) => {
      if (err instanceof Error) {
        assert.strictEqual(err.name, 'Error')
        assert.strictEqual(err.message, 'S3BlobStore bucket option required')
        return true
      } else {
        return false
      }
    },
  )
})
