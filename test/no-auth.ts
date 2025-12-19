import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const packageJson = JSON.parse(
  readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
)

const testEnv = {
  NODE_ENV: 'test',
  PORT: 3000,
  LOG_LEVEL: 'info',
  LOG_MODE: 'stdout',
  LOG_FILE: 'server.log',
  AUTH_MODE: 'none',
  STORAGE_PROVIDER: 'local',
  STORAGE_PATH: join(tmpdir(), 'turborepo-remote-cache-test-no-auth'),
}

test('AUTH_MODE=none', async (t) => {
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

  await t.test('loads correct AUTH_MODE', async () => {
    assert.equal(app.config.AUTH_MODE, 'none')
  })

  await t.test(
    'should allow requests without authorization header',
    async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v8/artifacts/not-found',
        query: {
          team: 'superteam',
        },
      })
      // Should return 404 (not found) instead of 400 (missing auth)
      assert.equal(response.statusCode, 404)
      assert.equal(response.json().message, 'Artifact not found')
    },
  )

  await t.test('should upload an artifact without auth', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/v8/artifacts/${artifactId}`,
      headers: {
        'content-type': 'application/octet-stream',
      },
      query: {
        team,
      },
      payload: Buffer.from('test cache data'),
    })
    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.json(), { urls: [`${team}/${artifactId}`] })
  })

  await t.test('should download an artifact without auth', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/v8/artifacts/${artifactId}`,
      query: {
        team,
      },
    })
    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.body, 'test cache data')
  })

  await t.test('should verify artifact exists without auth', async () => {
    const response = await app.inject({
      method: 'HEAD',
      url: `/v8/artifacts/${artifactId}`,
      query: {
        team,
      },
    })
    assert.equal(response.statusCode, 200)
    assert.equal(response.body, '')
  })

  await t.test(
    'should return 200 when POST artifacts/events is called without auth',
    async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v8/artifacts/events',
        headers: {
          'content-type': 'application/octet-stream',
        },
        payload: Buffer.from('test cache data'),
      })
      assert.equal(response.statusCode, 200)
      assert.deepEqual(response.json(), {})
    },
  )

  await t.test(
    'should return 200 when GET artifacts/status is called without auth',
    async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v8/artifacts/status',
      })
      assert.equal(response.statusCode, 200)
      assert.deepEqual(response.json(), {
        status: 'enabled',
        version: packageJson.version,
      })
    },
  )

  await t.test(
    'should still work when authorization header is provided',
    async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/v8/artifacts/${artifactId}`,
        headers: {
          authorization: 'Bearer some-token',
        },
        query: {
          team,
        },
      })
      // Should work even with auth header (it's just ignored)
      assert.equal(response.statusCode, 200)
      assert.deepEqual(response.body, 'test cache data')
    },
  )
})
