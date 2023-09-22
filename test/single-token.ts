import assert from 'node:assert/strict'
import { test } from 'node:test'

const testEnv = {
  NODE_ENV: 'test',
  PORT: 3000,
  LOG_LEVEL: 'info',
  LOG_MODE: 'stdout',
  LOG_FILE: 'server.log',
  TURBO_TOKEN: 'changeme',
  STORAGE_PROVIDER: 'local',
  STORAGE_PATH: 'turborepo-remote-cache-test',
}
Object.assign(process.env, testEnv)

test('should return array with one token', async (t) => {
  const { createApp } = await import('../src/app.js')
  const app = createApp({ logger: false })
  await app.ready()

  assert.equal(Array.isArray(app.config.TURBO_TOKEN), true)
  assert.equal(app.config.TURBO_TOKEN.length, 1)
  assert.deepEqual(app.config.TURBO_TOKEN, ['changeme'])
})
