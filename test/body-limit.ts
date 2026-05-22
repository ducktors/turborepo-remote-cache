import assert from 'node:assert/strict'
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
  STORAGE_PATH: join(tmpdir(), 'turborepo-remote-cache-test-limit'),
  BODY_LIMIT: 10, // 仅限制 10 字节
}

test('Fastify body limit verification', async (t) => {
  Object.assign(process.env, testEnv)
  const { env } = await import('../src/env.js')
  t.mock.method(env, 'get', () => {
    return testEnv
  })

  const { createApp } = await import('../src/app.js')
  const app = createApp({ logger: false })
  await app.ready()

  await t.test(
    'should reject payload exceeding the configured BODY_LIMIT',
    async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/v8/artifacts/some-artifact-id',
        headers: {
          authorization: 'Bearer changeme',
          'content-type': 'application/octet-stream',
        },
        query: {
          team: 'superteam',
        },
        payload: Buffer.from('this payload is definitely longer than 10 bytes'),
      })

      assert.equal(response.statusCode, 413)
      assert.equal(response.json().message, 'Request body is too large')
    },
  )

  await t.test(
    'should accept payload within the configured BODY_LIMIT',
    async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/v8/artifacts/small-artifact-id',
        headers: {
          authorization: 'Bearer changeme',
          'content-type': 'application/octet-stream',
        },
        query: {
          team: 'superteam',
        },
        payload: Buffer.from('12345'), // 5 字节
      })

      // 如果小于 bodyLimit，则不应该被 Fastify Body Too Large (413) 拦截
      assert.notEqual(response.statusCode, 413)
    },
  )
})
