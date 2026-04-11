import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const testEnv = {
  NODE_ENV: 'test',
  PORT: 3000,
  LOG_LEVEL: 'info',
  LOG_MODE: 'stdout',
  LOG_FILE: 'server.log',
  TURBO_TOKEN: ['changeme'],
  STORAGE_PROVIDER: 'local',
  STORAGE_PATH: join(tmpdir(), 'turborepo-remote-cache-test-read-only'),
  READ_ONLY: true,
}

test('read-only mode', async (t) => {
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
  const artifactId = crypto.randomBytes(20).toString('hex')
  const team = 'superteam'
  const app = createApp({ logger: false })
  await app.ready()

  await t.test(
    'should return 403 when uploading an artifact in read-only mode',
    async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/v8/artifacts/${artifactId}`,
        headers: {
          authorization: 'Bearer changeme',
          'content-type': 'application/octet-stream',
        },
        query: {
          team,
        },
        payload: Buffer.from('test cache data'),
      })
      assert.equal(response.statusCode, 403)
      assert.equal(
        response.json().message,
        'Remote cache is running in read-only mode',
      )
    },
  )

  await t.test(
    'should return 403 when posting artifacts/events in read-only mode',
    async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v8/artifacts/events',
        headers: {
          authorization: 'Bearer changeme',
          'content-type': 'application/octet-stream',
        },
        payload: Buffer.from('test cache data'),
      })
      assert.equal(response.statusCode, 403)
      assert.equal(
        response.json().message,
        'Remote cache is running in read-only mode',
      )
    },
  )

  await t.test(
    'should still allow downloading artifacts in read-only mode',
    async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/v8/artifacts/${artifactId}`,
        headers: {
          authorization: 'Bearer changeme',
        },
        query: {
          team,
        },
      })
      assert.notEqual(response.statusCode, 403)
    },
  )

  await t.test(
    'should still allow checking artifact existence in read-only mode',
    async () => {
      const response = await app.inject({
        method: 'HEAD',
        url: `/v8/artifacts/${artifactId}`,
        headers: {
          authorization: 'Bearer changeme',
        },
        query: {
          team,
        },
      })
      assert.notEqual(response.statusCode, 403)
    },
  )

  await t.test(
    'should still allow checking status in read-only mode',
    async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v8/artifacts/status',
        headers: {
          authorization: 'Bearer changeme',
        },
      })
      assert.equal(response.statusCode, 200)
    },
  )
})
