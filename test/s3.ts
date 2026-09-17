import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, test } from 'node:test'
import S3erver from 's3rver'
import { isCacheMissError } from '../src/plugins/remote-cache/storage/s3.js'

const s3rverDirectory = mkdtempSync(join(tmpdir(), 's3rver-s3-'))

describe('isCacheMissError', () => {
  test('treats a missing object as a cache miss', () => {
    // HeadObject on a missing key
    assert.equal(
      isCacheMissError({
        name: 'NotFound',
        $metadata: { httpStatusCode: 404 },
      }),
      true,
    )
    // GetObject on a missing key
    assert.equal(
      isCacheMissError({
        name: 'NoSuchKey',
        $metadata: { httpStatusCode: 404 },
      }),
      true,
    )
    assert.equal(isCacheMissError({ Code: 'NoSuchKey' }), true)
    // S3 returns 403 for a missing object when the IAM policy lacks
    // s3:ListBucket (least-privilege setups). Must still be a cache miss.
    assert.equal(
      isCacheMissError({ name: 'Unknown', $metadata: { httpStatusCode: 403 } }),
      true,
    )
  })

  test('treats real backend failures as errors, not cache misses', () => {
    // Throttling
    assert.equal(
      isCacheMissError({
        name: 'SlowDown',
        $metadata: { httpStatusCode: 503 },
      }),
      false,
    )
    // Server error
    assert.equal(
      isCacheMissError({
        name: 'InternalError',
        $metadata: { httpStatusCode: 500 },
      }),
      false,
    )
    // Network error (no metadata)
    assert.equal(isCacheMissError(new Error('connect ECONNREFUSED')), false)
    assert.equal(isCacheMissError(null), false)
    assert.equal(isCacheMissError(undefined), false)
  })
})

const testEnv = {
  NODE_ENV: 'test',
  PORT: 3000,
  LOG_LEVEL: 'info',
  LOG_MODE: 'stdout',
  LOG_FILE: 'server.log',
  TURBO_TOKEN: ['changeme'],
  STORAGE_PROVIDER: 's3',
  STORAGE_PATH: 'turborepo-remote-cache-test-s3',
  AWS_ACCESS_KEY_ID: 'S3RVER',
  AWS_SECRET_ACCESS_KEY: 'S3RVER',
  AWS_REGION: 'us-east-2',
}
Object.assign(process.env, testEnv)

describe('Amazon S3', async () => {
  const server = new S3erver({
    directory: s3rverDirectory,
    silent: true,
    port: 0,
    configureBuckets: [
      {
        name: process.env.STORAGE_PATH || '',
        configs: [],
      },
    ],
  })
  const address = await server.run()
  Object.assign(process.env, {
    S3_ENDPOINT: `http://localhost:${address.port}`,
  })

  let serverClosed = false
  async function closeServer() {
    if (serverClosed) {
      return
    }
    serverClosed = true
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }

  after(async () => {
    await closeServer()
  })

  const artifactId = crypto.randomBytes(20).toString('hex')
  const team = 'superteam'

  const { createApp } = await import('../src/app.js')
  const app = createApp({ logger: false })
  await app.ready()

  await test('loads correct env vars', async () => {
    assert.equal(app.config.STORAGE_PROVIDER, testEnv.STORAGE_PROVIDER)
    assert.equal(app.config.STORAGE_PATH, testEnv.STORAGE_PATH)
  })

  await test('should return 400 when missing authorization header', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v8/artifacts/not-found',
      headers: {},
    })
    assert.equal(response.statusCode, 400)
    assert.equal(response.json().message, 'Missing Authorization header')
  })

  await test('should return 401 when wrong authorization token is provided', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v8/artifacts/not-found',
      headers: {
        authorization: 'wrong token',
      },
    })
    assert.equal(response.statusCode, 401)
    assert.equal(response.json().message, 'Invalid authorization token')
  })

  await test('should return 400 when missing team query parameter', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v8/artifacts/not-found',
      headers: {
        authorization: 'Bearer changeme',
      },
    })
    assert.equal(response.statusCode, 400)
    assert.equal(
      response.json().message,
      "querystring should have required property 'team'",
    )
  })

  await test('should return 404 on cache miss', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v8/artifacts/not-found',
      headers: {
        authorization: 'Bearer changeme',
      },
      query: {
        team: 'superteam',
      },
    })
    assert.equal(response.statusCode, 404)
    assert.equal(response.json().message, 'Artifact not found')
  })

  await test('should upload an artifact', async () => {
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
    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.json(), { urls: [`${team}/${artifactId}`] })
  })

  await test('should download an artifact', async () => {
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
    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.body, 'test cache data')
  })

  await test('should verify artifact exists', async () => {
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
    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.body, '')
  })

  await test('should verify artifact does not exist', async () => {
    const response = await app.inject({
      method: 'HEAD',
      url: '/v8/artifacts/not-found',
      headers: {
        authorization: 'Bearer changeme',
      },
      query: {
        team,
      },
    })
    assert.equal(response.statusCode, 404)
    assert.equal(response.json().message, 'Artifact not found')
  })

  // Regression test: a real storage-backend failure must surface as a 5xx,
  // not be masked as a 404 cache miss. We simulate the backend being down by
  // shutting down the S3 server, so requests fail with a connection error
  // rather than a genuine not-found. This must run last.
  await test('should return 5xx (not 404) when the storage backend fails', async () => {
    await closeServer()

    const getResponse = await app.inject({
      method: 'GET',
      url: '/v8/artifacts/some-artifact',
      headers: {
        authorization: 'Bearer changeme',
      },
      query: {
        team,
      },
    })
    assert.equal(
      getResponse.statusCode >= 500,
      true,
      `expected 5xx, got ${getResponse.statusCode}`,
    )

    const headResponse = await app.inject({
      method: 'HEAD',
      url: '/v8/artifacts/some-artifact',
      headers: {
        authorization: 'Bearer changeme',
      },
      query: {
        team,
      },
    })
    assert.equal(
      headResponse.statusCode >= 500,
      true,
      `expected 5xx, got ${headResponse.statusCode}`,
    )
  })
})
