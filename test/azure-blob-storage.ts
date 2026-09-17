import assert from 'node:assert'
import crypto from 'node:crypto'
import { Readable, Transform, pipeline as pipelineCallback } from 'node:stream'
import { afterEach, mock, test } from 'node:test'
import { promisify } from 'node:util'
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

const pipeline = promisify(pipelineCallback)

// Mirrors the SDK BufferScheduler: the upload settles on the `end` or `error`
// event of the stream only, and never on `close`. The test reads the recorded
// state, not the returned promise, so an unhandled rejection stays visible.
// With `failAfterBytes`, a block upload fails after that many bytes. Then the
// mock pauses the stream and rejects, as BufferScheduler does.
function mockBlockUpload({ failAfterBytes = Number.POSITIVE_INFINITY } = {}) {
  const upload: {
    stream?: Readable
    abortSignal?: AbortSignal
    outcome?: 'end' | Error
  } = {}
  mock.method(BlobServiceClient, 'fromConnectionString', () => ({
    getContainerClient: () => ({
      getBlockBlobClient: () => ({
        uploadStream: (
          stream: Readable,
          _bufferSize,
          _concurrency,
          options,
        ) => {
          upload.stream = stream
          upload.abortSignal = options?.abortSignal
          return new Promise((resolve, reject) => {
            let received = 0
            stream.on('data', (chunk: Buffer) => {
              received += chunk.length
              if (received > failAfterBytes) {
                stream.pause()
                upload.outcome = new Error('Block upload failed')
                reject(upload.outcome)
              }
            })
            stream.on('end', () => {
              upload.outcome = 'end'
              resolve({})
            })
            stream.on('error', (err) => {
              upload.outcome = err
              reject(err)
            })
          })
        },
      }),
    }),
  }))
  return upload
}

test('createWriteStream aborts the Azure upload when the pipeline fails', async () => {
  // pipeline() destroys the destination when an upstream stage fails, and
  // destruction skips final(). The SDK does not listen for `close`. Unless
  // destroy() gives the PassThrough an error, the upload promise never settles
  // and keeps its buffers and requests alive.
  const upload = mockBlockUpload()
  const storage = createAzureBlobStorage({
    containerName: 'turborepo-remote-cache-test',
    connectionString: 'key1=value1;key2=value2',
  })

  const unhandled: unknown[] = []
  const onUnhandled = (reason: unknown) => unhandled.push(reason)
  process.on('unhandledRejection', onUnhandled)

  let chunks = 0
  const sizeLimit = new Transform({
    transform(chunk, _encoding, callback) {
      chunks++
      if (chunks > 1) {
        callback(new Error('Request body is too large'))
        return
      }
      callback(null, chunk)
    },
  })

  let timer: NodeJS.Timeout | undefined
  const outcome = await Promise.race([
    pipeline(
      Readable.from([Buffer.from('first'), Buffer.from('second')]),
      sizeLimit,
      storage.createWriteStream('superteam/hash'),
    ).then(
      () => 'resolved',
      (error: Error) => error.message,
    ),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve('hung'), 1000)
    }),
  ])
  clearTimeout(timer)
  // Let a rejection without a handler reach the `unhandledRejection` event.
  await new Promise((resolve) => setImmediate(resolve))
  process.off('unhandledRejection', onUnhandled)

  assert.equal(outcome, 'Request body is too large')
  assert.equal(upload.stream?.destroyed, true, 'the PassThrough is destroyed')
  assert.ok(
    upload.outcome instanceof Error,
    'the PassThrough must fail with an error, so the SDK upload settles',
  )
  assert.equal(
    upload.abortSignal?.aborted,
    true,
    'destroy must abort the SDK request',
  )
  assert.deepEqual(
    unhandled.map(String),
    [],
    'aborting the upload must not leave an unhandled rejection',
  )
  mock.restoreAll()
})

test('createWriteStream does not abort a completed Azure upload', async () => {
  // autoDestroy calls destroy() after a successful finish. That call must not
  // abort the request of an upload that is already complete.
  const upload = mockBlockUpload()
  const storage = createAzureBlobStorage({
    containerName: 'turborepo-remote-cache-test',
    connectionString: 'key1=value1;key2=value2',
  })

  const writeStream = storage.createWriteStream('superteam/hash')
  await pipeline(Readable.from([Buffer.from('cache data')]), writeStream)
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(writeStream.destroyed, true, 'autoDestroy destroys the stream')
  assert.equal(upload.outcome, 'end')
  assert.equal(
    upload.abortSignal?.aborted,
    false,
    'a completed upload must not be aborted',
  )
  mock.restoreAll()
})

test('createWriteStream fails when the Azure block upload fails', async () => {
  // The SDK pauses the PassThrough when a block upload fails. Unless the
  // adapter destroys the writable with the upload error, a pending write never
  // calls back and the request stalls.
  mockBlockUpload({ failAfterBytes: 256 * 1024 })
  const storage = createAzureBlobStorage({
    containerName: 'turborepo-remote-cache-test',
    connectionString: 'key1=value1;key2=value2',
  })

  const unhandled: unknown[] = []
  const onUnhandled = (reason: unknown) => unhandled.push(reason)
  process.on('unhandledRejection', onUnhandled)

  const source = Readable.from(
    (function* () {
      for (let i = 0; i < 64; i++) {
        yield Buffer.alloc(64 * 1024, 1)
      }
    })(),
  )
  let timer: NodeJS.Timeout | undefined
  const outcome = await Promise.race([
    pipeline(source, storage.createWriteStream('superteam/hash')).then(
      () => 'resolved',
      (error: Error) => error.message,
    ),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve('hung'), 1000)
    }),
  ])
  clearTimeout(timer)
  // Let a rejection without a handler reach the `unhandledRejection` event.
  await new Promise((resolve) => setImmediate(resolve))
  process.off('unhandledRejection', onUnhandled)

  assert.equal(outcome, 'Block upload failed')
  assert.deepEqual(
    unhandled.map(String),
    [],
    'a failed upload must not leave an unhandled rejection',
  )
  mock.restoreAll()
})
