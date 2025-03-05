import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import mockJWKS from 'mock-jwks'

const jwksUrl = 'http://test.com/.well-known/jwks.json'
const jwksMock = mockJWKS.createJWKSMock('http://test.com')

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

let stopJwks: () => void
before(() => {
  stopJwks = jwksMock.start()
})
after(() => stopJwks?.())

describe('API Specification Tests', async () => {
  const { createApp } = await import('../src/app.js')
  const app = createApp({
    logger: false,
    configOverrides: {
      JWT_READ_SCOPES: 'artifacts:read',
      JWT_WRITE_SCOPES: 'artifacts:write',
    },
  })
  await app.ready()

  const token = jwksMock.token({ scope: 'artifacts:read artifacts:write' })
  const readOnlyToken = jwksMock.token({ scope: 'artifacts:read' })
  const team = randomUUID()

  await test('GET /v8/artifacts/status', async (t) => {
    await t.test('returns enabled status with valid token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v8/artifacts/status',
        headers: {
          authorization: `Bearer ${token}`,
        },
        query: {
          teamId: team,
        },
      })
      assert.equal(response.statusCode, 200)
      const body = JSON.parse(response.body)
      assert.equal(body.status, 'enabled')
    })

    await t.test('returns 401 without token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v8/artifacts/status',
        query: {
          teamId: team,
        },
      })
      assert.equal(response.statusCode, 401)
    })
  })

  await test('PUT and GET /v8/artifacts/{hash}', async (t) => {
    const hash = '12HKQaOmR5t5Uy6vdcQsNIiZgHGB'
    const artifactContent = 'test artifact content'

    await t.test('uploads artifact successfully', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/v8/artifacts/${hash}`,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/octet-stream',
          'content-length': Buffer.from(artifactContent).length.toString(),
          'x-artifact-duration': '400',
          'x-artifact-client-ci': 'VERCEL',
          'x-artifact-client-interactive': '0',
          'x-artifact-tag': 'Tc0BmHvJYMIYJ62/zx87YqO0Flxk+5Ovip25NY825CQ=',
        },
        query: {
          teamId: team,
        },
        payload: Buffer.from(artifactContent),
      })
      assert.equal(response.statusCode, 200)
      const body = JSON.parse(response.body)
      assert(Array.isArray(body.urls))
      assert(body.urls.length > 0)
    })

    await t.test('downloads artifact successfully', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/v8/artifacts/${hash}`,
        headers: {
          authorization: `Bearer ${token}`,
          'x-artifact-client-ci': 'VERCEL',
          'x-artifact-client-interactive': '0',
        },
        query: {
          teamId: team,
        },
      })
      assert.equal(response.statusCode, 200)
      assert.equal(response.body, artifactContent)
    })

    await t.test('checks artifact existence with HEAD', async () => {
      const response = await app.inject({
        method: 'HEAD',
        url: `/v8/artifacts/${hash}`,
        headers: {
          authorization: `Bearer ${token}`,
        },
        query: {
          teamId: team,
        },
      })
      assert.equal(response.statusCode, 200)
    })
  })

  await test('POST /v8/artifacts', async (t) => {
    const hash1 = '12HKQaOmR5t5Uy6vdcQsNIiZgHGB'
    const hash2 = 'nonexistent-hash'
    const artifactContent = 'test artifact content'

    // First upload an artifact so we have something to query
    await app.inject({
      method: 'PUT',
      url: `/v8/artifacts/${hash1}`,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/octet-stream',
        'content-length': Buffer.from(artifactContent).length.toString(),
        'x-artifact-duration': '400',
        'x-artifact-tag': 'test-tag',
      },
      query: {
        teamId: team,
      },
      payload: Buffer.from(artifactContent),
    })

    await t.test('queries multiple artifacts successfully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v8/artifacts',
        headers: {
          authorization: `Bearer ${token}`,
        },
        query: {
          teamId: team,
        },
        payload: {
          hashes: [hash1, hash2],
        },
      })
      assert.equal(response.statusCode, 200)
      const body = JSON.parse(response.body)

      // Check the existing artifact
      assert(body[hash1])
      assert.equal(typeof body[hash1].size, 'number')
      assert.equal(typeof body[hash1].taskDurationMs, 'number')
      assert.equal(body[hash1].tag, 'test-tag')

      // Check the non-existent artifact
      assert(body[hash2])
      assert(body[hash2].error)
      assert(body[hash2].error.message)
    })

    await t.test('validates request payload', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v8/artifacts',
        headers: {
          authorization: `Bearer ${token}`,
        },
        query: {
          teamId: team,
        },
        payload: {
          // Missing required 'hashes' field
        },
      })
      assert.equal(response.statusCode, 400)
    })

    await t.test('requires read scope', async () => {
      const noScopeToken = jwksMock.token()
      const response = await app.inject({
        method: 'POST',
        url: '/v8/artifacts',
        headers: {
          authorization: `Bearer ${noScopeToken}`,
        },
        query: {
          teamId: team,
        },
        payload: {
          hashes: [hash1],
        },
      })
      assert.equal(response.statusCode, 403)
    })
  })

  await test('POST /v8/artifacts/events', async (t) => {
    await t.test('records events successfully', async () => {
      const events = [
        {
          sessionId: randomUUID(),
          source: 'LOCAL',
          hash: '12HKQaOmR5t5Uy6vdcQsNIiZgHGB',
          event: 'HIT',
          duration: 400,
        },
        {
          sessionId: randomUUID(),
          source: 'REMOTE',
          hash: '12HKQaOmR5t5Uy6vdcQsNIiZgHGB',
          event: 'MISS',
        },
      ]

      const response = await app.inject({
        method: 'POST',
        url: '/v8/artifacts/events',
        headers: {
          authorization: `Bearer ${token}`,
          'x-artifact-client-ci': 'VERCEL',
          'x-artifact-client-interactive': '0',
        },
        query: {
          teamId: team,
        },
        payload: events,
      })
      assert.equal(response.statusCode, 200)
    })

    await t.test('validates event payload', async () => {
      const invalidEvents = [
        {
          sessionId: randomUUID(),
          source: 'INVALID',
          hash: '12HKQaOmR5t5Uy6vdcQsNIiZgHGB',
          event: 'HIT',
        },
      ]

      const response = await app.inject({
        method: 'POST',
        url: '/v8/artifacts/events',
        headers: {
          authorization: `Bearer ${token}`,
        },
        query: {
          teamId: team,
        },
        payload: invalidEvents,
      })
      assert.equal(response.statusCode, 400)
    })
  })

  await test('Authorization scopes', async (t) => {
    const hash = randomUUID()

    await t.test('read-only token cannot upload artifacts', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/v8/artifacts/${hash}`,
        headers: {
          authorization: `Bearer ${readOnlyToken}`,
          'content-type': 'application/octet-stream',
          'content-length': '4',
        },
        query: {
          teamId: team,
        },
        payload: 'test',
      })
      assert.equal(response.statusCode, 403)
    })

    await t.test('read-only token can download artifacts', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/v8/artifacts/${hash}`,
        headers: {
          authorization: `Bearer ${readOnlyToken}`,
        },
        query: {
          teamId: team,
        },
      })
      // Should be 404 since we couldn't upload it, but the authorization worked
      assert.equal(response.statusCode, 404)
    })
  })
})
