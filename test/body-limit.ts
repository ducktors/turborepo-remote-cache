import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const TEN_MB = 10 * 1024 * 1024

const testEnv = {
  NODE_ENV: 'test',
  PORT: 3000,
  LOG_LEVEL: 'info',
  LOG_MODE: 'stdout',
  LOG_FILE: 'server.log',
  AUTH_MODE: 'none',
  STORAGE_PROVIDER: 'local',
  STORAGE_PATH: join(tmpdir(), 'turborepo-remote-cache-test-body-limit'),
  BODY_LIMIT: TEN_MB,
}

test('BODY_LIMIT wiring', async (t) => {
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
  const app = createApp({ logger: false, bodyLimit: TEN_MB })
  await app.ready()

  await t.test('accepts payload below configured BODY_LIMIT', async () => {
    const artifactId = crypto.randomBytes(20).toString('hex')
    const response = await app.inject({
      method: 'PUT',
      url: `/v8/artifacts/${artifactId}`,
      headers: { 'content-type': 'application/octet-stream' },
      query: { team: 'superteam' },
      payload: Buffer.alloc(5 * 1024 * 1024, 1),
    })

    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.json(), {
      urls: [`superteam/${artifactId}`],
    })
  })

  await t.test(
    'rejects payload above configured BODY_LIMIT with 413',
    async () => {
      const artifactId = crypto.randomBytes(20).toString('hex')
      const response = await app.inject({
        method: 'PUT',
        url: `/v8/artifacts/${artifactId}`,
        headers: { 'content-type': 'application/octet-stream' },
        query: { team: 'superteam' },
        payload: Buffer.alloc(15 * 1024 * 1024, 1),
      })

      assert.equal(response.statusCode, 413)
      // The app's error handler now forwards err.statusCode for client errors,
      // so the underlying fastify message reaches the client instead of being
      // masked as a generic 500.
      assert.match(response.json().message, /too large/i)
    },
  )

  await t.test(
    'resolveBodyLimit falls back to default on invalid input',
    async () => {
      const { resolveBodyLimit, BODY_LIMIT_DEFAULT } = await import(
        '../src/env.js'
      )

      const invalidInputs: unknown[] = [
        Number.NaN,
        0,
        -1,
        Number.POSITIVE_INFINITY,
        'not-a-number',
        undefined,
        null,
      ]
      for (const input of invalidInputs) {
        const { value, warning } = resolveBodyLimit(input)
        assert.equal(
          value,
          BODY_LIMIT_DEFAULT,
          `expected fallback for input ${String(input)}`,
        )
        assert.ok(warning, `expected warning for input ${String(input)}`)
      }

      const valid = resolveBodyLimit(TEN_MB)
      assert.equal(valid.value, TEN_MB)
      assert.equal(valid.warning, undefined)
    },
  )

  await app.close()
})
