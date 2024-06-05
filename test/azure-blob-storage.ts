import assert from 'node:assert'
import crypto from 'node:crypto'
import { PassThrough, Readable } from 'node:stream'
import { afterEach, mock, test } from 'node:test'

const testEnv = {
  NODE_ENV: 'test',
  PORT: 3000,
  LOG_LEVEL: 'info',
  LOG_MODE: 'stdout',
  LOG_FILE: 'server.log',
  TURBO_TOKEN: ['changeme'],
  STORAGE_PROVIDER: 'azure-blob-storage',
  STORAGE_PATH: 'turborepo-remote-cache-test',
  ABS_CONNECTION_STRING: 'key1=value1;key2=value2',
}
Object.assign(process.env, testEnv)

test('Azure Blob Storage', async (t) => {
  /**
   * MOCKS
   */
  const { BlobServiceClient } = await import('@azure/storage-blob')

  const uploadStream = (stream) => {
    const writable = new PassThrough()
    return writable.pipe(stream)
  }

  const uploadStreamMock = mock.fn(uploadStream)

  mock.method(BlobServiceClient, 'fromConnectionString', () => ({
    getContainerClient: () => ({
      getBlobClient: (artifactPath) => ({
        exists: () =>
          artifactPath.endsWith('not-found')
            ? Promise.resolve(false)
            : Promise.resolve(true),
        download: () => {
          const readable = new Readable({
            read(size) {
              this.push('test cache data')
              this.push(null)
            },
          })
          return Promise.resolve({ readableStreamBody: readable })
        },
      }),
      getBlockBlobClient: () => ({
        uploadStream: uploadStreamMock,
      }),
    }),
  }))
  /**
   * END MOCKS
   */

  const artifactId = crypto.randomBytes(20).toString('hex')
  const team = 'superteam'
  const { createApp } = await import('../src/app.js')
  const app = createApp({ logger: false })
  await app.ready()

  afterEach(() => {
    mock.restoreAll()
  })

  await t.test('loads correct env vars', async () => {
    assert.equal(app.config.STORAGE_PROVIDER, testEnv.STORAGE_PROVIDER)
    assert.equal(app.config.STORAGE_PATH, testEnv.STORAGE_PATH)
    assert.equal(
      app.config.ABS_CONNECTION_STRING,
      testEnv.ABS_CONNECTION_STRING,
    )
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
    const waitStreamData = (stream): Promise<Buffer> => {
      return new Promise((resolve) => {
        stream.on('data', resolve)
      })
    }

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
    const streamData = await waitStreamData(
      uploadStreamMock.mock.calls[0].arguments[0],
    )
    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.json(), { urls: [`${team}/${artifactId}`] })
    assert.deepEqual(streamData.toString(), 'test cache data')
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
