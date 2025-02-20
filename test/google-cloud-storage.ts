import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import fsbs from 'fs-blob-store'

class GCSMock {
  bucket(bucket: string) {
    const path = join(tmpdir(), bucket)
    if (!fs.existsSync(path)) {
      fs.mkdirSync(path)
    }

    return {
      file: (filePath: string) => {
        const store = fsbs(path)
        return {
          exists: (cb) => {
            return store.exists(filePath, cb)
          },
          createReadStream() {
            return store.createReadStream(filePath)
          },
          createWriteStream() {
            return store.createWriteStream(filePath)
          },
        }
      },
    }
  }
}
const commonTestEnv = {
  NODE_ENV: 'test',
  PORT: 3000,
  LOG_LEVEL: 'info',
  LOG_MODE: 'stdout',
  LOG_FILE: 'server.log',
  TURBO_TOKEN: ['changeme'],
  STORAGE_PROVIDER: 'google-cloud-storage',
  STORAGE_PATH: 'turborepo-remote-cache-test',
}

Object.assign(process.env, commonTestEnv)

test('Google Cloud Storage', async (t) => {
  /**
   * MOCKS
   */
  const testEnv = {
    GCS_PROJECT_ID: 'some-storage',
    GCS_CLIENT_EMAIL: 'service-account@some-storage.iam.gserviceaccount.com',
    GCS_PRIVATE_KEY:
      '-----BEGIN PRIVATE KEY-----\nFooBarKey\n-----END PRIVATE KEY-----\n',
  }
  const GCS = await import('@google-cloud/storage')
  const mockedGCS = t.mock.getter(GCS, 'Storage', function () {
    return GCSMock
  })
  /**
   * END MOCKS
   */

  const artifactId = crypto.randomBytes(20).toString('hex')
  const team = 'superteam'

  const { createApp } = await import('../src/app.js')
  const app = createApp({ logger: false, configOverrides: testEnv })
  await app.ready()

  await t.test('loads correct env vars', async () => {
    assert.equal(app.config.STORAGE_PROVIDER, commonTestEnv.STORAGE_PROVIDER)
    assert.equal(app.config.STORAGE_PATH, commonTestEnv.STORAGE_PATH)
    assert.equal(app.config.GCS_PROJECT_ID, testEnv.GCS_PROJECT_ID)
    assert.equal(app.config.GCS_CLIENT_EMAIL, testEnv.GCS_CLIENT_EMAIL)
    assert.equal(app.config.GCS_PRIVATE_KEY, testEnv.GCS_PRIVATE_KEY)
  })

  await t.test('creates a GCS storage instance', async () => {
    assert.equal(mockedGCS.mock.calls.length, 1)
  })

  await t.test(
    'should return 400 when missing authorization header',
    async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v8/artifacts/not-found',
        headers: {},
      })
      assert.equal(response.statusCode, 400)
      assert.equal(response.json().message, 'Missing Authorization header')
    },
  )
  await t.test(
    'should return 401 when wrong authorization token is provided',
    async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v8/artifacts/not-found',
        headers: {
          authorization: 'wrong token',
        },
      })
      assert.equal(response.statusCode, 401)
      assert.equal(response.json().message, 'Invalid authorization token')
    },
  )
  await t.test(
    'should return 400 when missing team query parameter',
    async () => {
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
    },
  )
  await t.test('should return 404 on cache miss', async () => {
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
  await t.test('should upload an artifact', async () => {
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
  await t.test('should download an artifact', async () => {
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
  await t.test('should verify artifact exists', async () => {
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
  await t.test('should verify artifact does not exist', async () => {
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
  await t.test('should upload an artifact when slug is used', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/v8/artifacts/${artifactId}`,
      headers: {
        authorization: 'Bearer changeme',
        'content-type': 'application/octet-stream',
      },
      query: {
        slug: team,
      },
      payload: Buffer.from('test cache data'),
    })
    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.json(), { urls: [`${team}/${artifactId}`] })
  })
  await t.test(
    'should return 200 when POST artifacts/events is called',
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
      assert.equal(response.statusCode, 200)
      assert.deepEqual(response.json(), {})
    },
  )
})

test('Google Cloud Storage ADC', async (t) => {
  const testEnv = {
    GCS_PROJECT_ID: '',
    GCS_CLIENT_EMAIL: '',
    GCS_PRIVATE_KEY: '',
  }
  /**
   * MOCKS
   */

  const GCS = await import('@google-cloud/storage')
  const mockedGCS = t.mock.getter(GCS, 'Storage', function () {
    return GCSMock
  })
  /**
   * END MOCKS
   */

  const artifactId = crypto.randomBytes(20).toString('hex')
  const team = 'superteam2'

  const { createApp } = await import('../src/app.js')
  const app = createApp({ logger: false, configOverrides: testEnv })
  await app.ready()

  await t.test('loads correct env vars', async () => {
    assert.equal(app.config.STORAGE_PROVIDER, commonTestEnv.STORAGE_PROVIDER)
    assert.equal(app.config.STORAGE_PATH, commonTestEnv.STORAGE_PATH)
    assert.equal(app.config.GCS_PROJECT_ID, testEnv.GCS_PROJECT_ID)
    assert.equal(app.config.GCS_CLIENT_EMAIL, testEnv.GCS_CLIENT_EMAIL)
    assert.equal(app.config.GCS_PRIVATE_KEY, testEnv.GCS_PRIVATE_KEY)
  })

  await t.test('creates a GCS storage instance', async () => {
    assert.equal(mockedGCS.mock.calls.length, 1)
  })

  await t.test('uploads an artifact', async () => {
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
})
