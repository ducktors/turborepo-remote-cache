import assert from 'node:assert'
import crypto from 'node:crypto'
import { Readable } from 'node:stream'
import { afterEach, mock, test } from 'node:test'
import { BlobServiceClient } from '@azure/storage-blob'
import { createAzureBlobStorage } from '../src/plugins/remote-cache/storage/azure-blob-storage.js'

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

  // Mirrors the real blockBlobClient.uploadStream, which returns
  // Promise<BlobUploadCommonResponse>. The adapter now awaits this in `final`,
  // so it must be a promise; the passed-in stream is still captured as
  // arguments[0] for the "should upload an artifact" assertion below.
  const uploadStreamMock = mock.fn((_stream) => Promise.resolve({}))

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

// Resolves to the stream's outcome, or to 'hung' if it neither errored nor
// ended. Without a bound, a stream that is never ended or destroyed would stall
// the whole suite instead of failing this test with a usable message.
function readStreamOutcome(
  stream: NodeJS.ReadableStream,
): Promise<{ type: 'error'; error: Error } | { type: 'end' } | 'hung'> {
  return Promise.race([
    new Promise<{ type: 'error'; error: Error } | { type: 'end' }>(
      (resolve) => {
        stream.on('error', (error: Error) => resolve({ type: 'error', error }))
        stream.on('end', () => resolve({ type: 'end' }))
        stream.resume()
      },
    ),
    new Promise<'hung'>((resolve) => setTimeout(() => resolve('hung'), 200)),
  ])
}

test('createReadStream surfaces a download failure as a stream error', async () => {
  // A failing backend must destroy the returned stream with the underlying
  // error. Swallowing the rejection leaves the stream open (the request hangs)
  // and produces an unhandled rejection, which terminates the process under
  // Node's default --unhandled-rejections=throw.
  const downloadError = new Error('backend unavailable')

  mock.method(BlobServiceClient, 'fromConnectionString', () => ({
    getContainerClient: () => ({
      getBlobClient: () => ({
        download: () => Promise.reject(downloadError),
      }),
    }),
  }))

  const storage = createAzureBlobStorage({
    containerName: 'turborepo-remote-cache-test',
    connectionString: 'key1=value1;key2=value2',
  })

  const outcome = await readStreamOutcome(
    storage.createReadStream('superteam/hash'),
  )

  assert.deepEqual(
    outcome,
    { type: 'error', error: downloadError },
    'a rejected download must destroy the stream with the original error',
  )
  mock.restoreAll()
})

test('createReadStream errors when the response carries no body', async () => {
  // Azure types readableStreamBody as optional. If it is absent the stream was
  // previously never ended or destroyed, so the request hung until timeout
  // rather than failing fast.
  mock.method(BlobServiceClient, 'fromConnectionString', () => ({
    getContainerClient: () => ({
      getBlobClient: () => ({
        download: () => Promise.resolve({}),
      }),
    }),
  }))

  const storage = createAzureBlobStorage({
    containerName: 'turborepo-remote-cache-test',
    connectionString: 'key1=value1;key2=value2',
  })

  const outcome = await readStreamOutcome(
    storage.createReadStream('superteam/hash'),
  )

  assert.equal(
    outcome !== 'hung' && outcome.type,
    'error',
    'a response without a readable body must error instead of hanging',
  )
  mock.restoreAll()
})

test('createReadStream surfaces a mid-download failure as a stream error', async () => {
  // The download promise resolves, then the body fails partway through (dropped
  // connection). pipe() does not forward errors from source to destination, so
  // the failure has to be wired through explicitly or the request hangs.
  const midStreamError = new Error('connection reset')

  mock.method(BlobServiceClient, 'fromConnectionString', () => ({
    getContainerClient: () => ({
      getBlobClient: () => ({
        download: () => {
          const body = new Readable({ read() {} })
          body.push('partial cache data')
          setImmediate(() => body.destroy(midStreamError))
          return Promise.resolve({ readableStreamBody: body })
        },
      }),
    }),
  }))

  const storage = createAzureBlobStorage({
    containerName: 'turborepo-remote-cache-test',
    connectionString: 'key1=value1;key2=value2',
  })

  const outcome = await readStreamOutcome(
    storage.createReadStream('superteam/hash'),
  )

  assert.deepEqual(
    outcome,
    { type: 'error', error: midStreamError },
    'a body that fails mid-download must error the returned stream',
  )
  mock.restoreAll()
})

test('createWriteStream completes only after Azure commits the upload', async () => {
  // Isolated from the suite above: own mock so afterEach(mock.restoreAll) there
  // cannot strip it, and a caller-controlled deferred upload promise so we can
  // observe ordering deterministically (no Azurite, no timing race).
  let resolveUpload!: (value: unknown) => void
  const uploadPromise = new Promise((resolve) => {
    resolveUpload = resolve
  })

  mock.method(BlobServiceClient, 'fromConnectionString', () => ({
    getContainerClient: () => ({
      getBlockBlobClient: () => ({
        uploadStream: () => uploadPromise,
      }),
    }),
  }))

  const storage = createAzureBlobStorage({
    containerName: 'turborepo-remote-cache-test',
    connectionString: 'key1=value1;key2=value2',
  })

  const writeStream = storage.createWriteStream('superteam/hash.tag')
  let finished = false
  writeStream.on('finish', () => {
    finished = true
  })
  writeStream.end('tag-payload')

  // Flush microtasks/immediates: the payload has been fully written and ended.
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(
    finished,
    false,
    'write stream must not finish before the upload promise resolves',
  )

  resolveUpload({})
  await uploadPromise
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(
    finished,
    true,
    'write stream must finish once the upload promise resolves',
  )
})
