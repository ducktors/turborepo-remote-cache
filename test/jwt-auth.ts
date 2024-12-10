import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { createJWKSMock } from 'mock-jwks'

const jwksUrl = 'http://test.com/.well-known/jwks.json'
const jwksMock = createJWKSMock('http://test.com')
const invalidJwksMock = createJWKSMock('http://other.com')

const testEnv = {
  NODE_ENV: 'test',
  PORT: 3000,
  LOG_LEVEL: 'info',
  LOG_MODE: 'stdout',
  LOG_FILE: 'server.log',
  STORAGE_PROVIDER: 'local',
  STORAGE_PATH: join(tmpdir(), 'turborepo-remote-cache-test'),
  AUTH_MODE: 'jwt',
  JWKS_URL: jwksUrl,
}

Object.assign(process.env, testEnv)

let stopJwks
before(() => {
  const stopValid = jwksMock.start()
  const stopInvalid = invalidJwksMock.start()
  stopJwks = () => {
    stopValid()
    stopInvalid()
  }
})
after(() => stopJwks?.())

describe('JWT auth', async () => {
  await test('without authorization scopes configured', async (t) => {
    const { createApp } = await import('../src/app.js')
    const app = createApp({ logger: false })
    await app.ready()
    await t.test('Fails for static/malformed token', async () => {
      const resp = await app.inject({
        method: 'GET',
        url: '/v8/artifacts/123',
        headers: {
          authorization: 'Bearer changeme',
        },
        query: {
          team: 'asd',
        },
      })
      assert.equal(resp.statusCode, 401)
    })
    await t.test('Fails for invalid token', async () => {
      const token = invalidJwksMock.token()
      const resp = await app.inject({
        method: 'GET',
        url: '/v8/artifacts/123',
        headers: {
          authorization: `Bearer ${token}`,
        },
        query: {
          team: 'asd',
        },
      })
      assert.equal(resp.statusCode, 401)
    })
    await t.test('Valid token', async (t1) => {
      const artifactId = randomUUID()
      const team = randomUUID()
      const token = jwksMock.token()
      await t1.test('creates cache entry', async () => {
        const response = await app.inject({
          method: 'PUT',
          url: `/v8/artifacts/${artifactId}`,
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/octet-stream',
          },
          query: {
            team,
          },
          payload: Buffer.from('test cache data'),
        })
        assert.equal(response.statusCode, 200)
      })

      await t1.test('fetches artifact', async () => {
        const resp = await app.inject({
          method: 'GET',
          url: `/v8/artifacts/${artifactId}`,
          headers: {
            authorization: `Bearer ${token}`,
          },
          query: {
            team,
          },
        })
        assert.equal(resp.statusCode, 200)
      })
    })
  })
  await test('with authorization scopes defined', async (t) => {
    const { createApp } = await import('../src/app.js')
    const app = createApp({
      logger: false,
      configOverrides: {
        JWT_READ_SCOPES: 'artifacts:read,artifacts:write',
        JWT_WRITE_SCOPES: 'artifacts:write',
      },
    })
    await app.ready()
    const artifactId = randomUUID()
    const team = randomUUID()
    const token = jwksMock.token({ scope: 'artifacts:write' })

    await t.test('creates cache entry', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/v8/artifacts/${artifactId}`,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/octet-stream',
        },
        query: {
          team,
        },
        payload: Buffer.from('test cache data'),
      })
      assert.equal(response.statusCode, 200)
    })

    await t.test('fetches artifact', async () => {
      const resp = await app.inject({
        method: 'GET',
        url: `/v8/artifacts/${artifactId}`,
        headers: {
          authorization: `Bearer ${token}`,
        },
        query: {
          team,
        },
      })
      assert.equal(resp.statusCode, 200)
    })

    await t.test('forbidden with token without scope', async () => {
      const token = jwksMock.token()
      const resp = await app.inject({
        method: 'GET',
        url: `/v8/artifacts/${artifactId}`,
        headers: {
          authorization: `Bearer ${token}`,
        },
        query: {
          team,
        },
      })
      assert.equal(resp.statusCode, 403)
    })
  })
})
