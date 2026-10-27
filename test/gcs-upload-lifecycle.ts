import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { Readable } from 'node:stream'
import { test } from 'node:test'
import { Storage } from '@google-cloud/storage'
import { STORAGE_PROVIDERS } from '../src/env.js'
import { createLocation } from '../src/plugins/remote-cache/storage/index.js'

function deferred() {
  let resolve = () => {}
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

async function within<T>(promise: Promise<T>, label = 'result'): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`SDK HTTP barrier timed out: ${label}`)),
          2000,
        )
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

test(
  'locked GCS SDK upload cancellation on localhost without auth',
  { timeout: 15_000 },
  async (parent) => {
    for (const scenario of [
      'session-pending',
      'transfer-pending',
      'committed-lost-ack',
      'success',
      'storage-error',
    ]) {
      await parent.test(scenario, async (context) => {
        const entered = deferred()
        const connectionClosed = deferred()
        const methods: string[] = []
        const body = Buffer.from('body')
        let published = false
        let endpoint = ''
        const server = createServer((request, response) => {
          methods.push(request.method ?? '')
          response.on('close', () => {
            if (!response.writableEnded) connectionClosed.resolve()
          })
          request.resume()
          request.on('end', () => {
            if (request.method === 'POST') {
              if (scenario === 'session-pending') {
                entered.resolve()
                return
              }
              response
                .writeHead(200, { location: `${endpoint}/session/test` })
                .end()
            } else if (request.method === 'PUT') {
              if (scenario === 'transfer-pending') {
                entered.resolve()
                return
              }
              if (scenario === 'storage-error') {
                response.writeHead(503).end()
                return
              }
              published = true
              entered.resolve()
              if (scenario === 'committed-lost-ack') return
              const crc = bucket.crc32cGenerator()
              crc.update(body)
              response.setHeader('content-type', 'application/json')
              response.end(
                JSON.stringify({
                  size: String(body.length),
                  generation: '123',
                  crc32c: crc.toString(),
                  metadata: { 'artifact-tag': 'tag' },
                }),
              )
            } else {
              response.writeHead(500).end()
            }
          })
        })
        server.listen(0, '127.0.0.1')
        await once(server, 'listening')
        const address = server.address()
        assert.ok(address && typeof address !== 'string')
        endpoint = `http://127.0.0.1:${address.port}`
        const storage = new Storage({
          apiEndpoint: endpoint,
          useAuthWithCustomEndpoint: false,
          projectId: 'test',
          retryOptions: { maxRetries: 3, totalTimeout: 240, maxRetryDelay: 30 },
        })
        const bucket = storage.bucket('bucket')
        const sdkFile = bucket.file.bind(bucket)
        context.mock.method(bucket, 'file', (path: string) => {
          const file = sdkFile(path)
          const write = file.createWriteStream.bind(file)
          context.mock.method(file, 'createWriteStream', (options) => {
            // Append after the adapter's interceptor, scaling only its clock.
            // The real no-auth SDK transport, signal and writable stay intact.
            file.interceptors.push({
              request: (request) => {
                assert.equal(request.timeout, 60_000)
                return {
                  ...request,
                  uri: 'uri' in request ? request.uri : request.url,
                  timeout: 100,
                }
              },
            })
            return write(options)
          })
          return file
        })
        context.mock.method(
          Storage.prototype,
          'bucket',
          function (this: Storage) {
            assert.equal(this.retryOptions.maxRetries, 3)
            assert.equal(this.retryOptions.totalTimeout, 240)
            assert.equal(this.retryOptions.maxRetryDelay, 30)
            return bucket
          },
        )
        const location = createLocation(
          STORAGE_PROVIDERS.GOOGLE_CLOUD_STORAGE,
          { path: 'bucket', projectId: '', clientEmail: '', privateKey: '' },
        )
        const controller = new AbortController()
        const uploading = location.createCachedArtifact(
          'artifact',
          'team',
          Readable.from(body),
          { tag: 'tag', signal: controller.signal },
        )
        const result = uploading.then(
          () => undefined,
          (error: Error) => error,
        )
        try {
          if (scenario === 'success') {
            assert.equal(await within(result), undefined)
          } else if (scenario === 'storage-error') {
            assert.ok(await within(result))
          } else {
            await within(entered.promise, 'entered')
            controller.abort()
            const error = await within(result)
            assert.equal((error as NodeJS.ErrnoException)?.code, 'ABORT_ERR')
            await within(connectionClosed.promise, 'connection closed')
          }
          assert.equal(
            published,
            scenario === 'success' || scenario === 'committed-lost-ack',
          )
          assert.deepEqual(
            methods,
            scenario === 'session-pending' ? ['POST'] : ['POST', 'PUT'],
          )
        } finally {
          controller.abort()
          server.closeAllConnections()
          await new Promise<void>((resolve) => server.close(() => resolve()))
          await result
        }
      })
    }
  },
)
