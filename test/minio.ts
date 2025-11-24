import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { tmpdir } from 'node:os'
import { after, before, describe, test } from 'node:test'
import type { FastifyInstance } from 'fastify'
import S3erver from 's3rver'

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
  AWS_REGION: 'us-east-2',
}
Object.assign(process.env, testEnv)

describe('Amazon S3', async (t) => {
  let app: FastifyInstance
  let server: S3erver
  const artifactId = crypto.randomBytes(20).toString('hex')
  const team = 'superteam'

  before(async () => {
    server = new S3erver({
      directory: tmpdir(),
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
    const { createApp } = await import('../src/app.js')
    app = createApp({ logger: false })
    await app.ready()
  })

  after(async () => {
    await app.close()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  test('loads correct env vars', async () => {
    assert.equal(app.config.STORAGE_PROVIDER, testEnv.STORAGE_PROVIDER)
    assert.equal(app.config.STORAGE_PATH, testEnv.STORAGE_PATH)
  })

  test('should return 400 when missing authorization header', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v8/artifacts/not-found',
      headers: {},
    })
    assert.equal(response.statusCode, 400)
    assert.equal(response.json().message, 'Missing Authorization header')
  })

  test('should return 401 when wrong authorization token is provided', async () => {
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

  test('should return 400 when missing team query parameter', async () => {
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

  test('should return 404 on cache miss', async () => {
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

  test('should upload an artifact', async () => {
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

  test('should download an artifact', async () => {
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

  test('should verify artifact exists', async () => {
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

  test('should verify artifact does not exist', async () => {
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
})
