import assert from 'node:assert/strict'
import { request as httpRequest } from 'node:http'
import { constants, connect } from 'node:http2'
import { Writable } from 'node:stream'
import { test } from 'node:test'
import { Storage } from '@google-cloud/storage'
import { createApp } from '../src/app.js'

function deferred() {
  let resolve = () => {}
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

async function within<T>(promise: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Test barrier timed out')),
          1500,
        )
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

function controlledSink(stallWrite = false) {
  const written = deferred()
  const final = deferred()
  const destroying = deferred()
  const cleanup = deferred()
  let finish: (() => void) | undefined
  let published = false
  const sink = new Writable({
    write(_chunk, _encoding, callback) {
      written.resolve()
      if (!stallWrite) callback()
    },
    final(callback) {
      finish = () => {
        if (!sink.destroyed) {
          published = true
          callback()
        }
      }
      final.resolve()
    },
    destroy(error, callback) {
      destroying.resolve()
      cleanup.promise.then(() => callback(error))
    },
  })
  return {
    sink,
    written,
    final,
    destroying,
    cleanup,
    publish: () => finish?.(),
    get published() {
      return published
    },
  }
}

test(
  'upload lifecycle on real HTTP connections',
  { timeout: 30_000 },
  async (parent) => {
    for (const protocol of ['h1', 'h2']) {
      for (const scenario of [
        'normal',
        'incomplete',
        'response-loss',
        'deadline',
        'stalled-write',
        'shutdown',
        'committed-lost-ack',
      ]) {
        await parent.test(`${protocol}: ${scenario}`, async (context) => {
          const storage = controlledSink(scenario === 'stalled-write')
          const settled = deferred()
          const logs: Array<Record<string, unknown>> = []
          context.mock.method(Storage.prototype, 'bucket', () => ({
            file: () => ({
              interceptors: [],
              createWriteStream: () => storage.sink,
            }),
          }))
          const appOptions = {
            logger: {
              stream: new Writable({
                write(chunk, _encoding, callback) {
                  const log = JSON.parse(chunk.toString())
                  logs.push(log)
                  if (log.msg === 'Artifact upload locally settled')
                    settled.resolve()
                  callback()
                },
              }),
            },
            http2: protocol === 'h2',
            configOverrides: {
              NODE_ENV: 'test',
              TURBO_TOKEN: 'token',
              STORAGE_PROVIDER: 'google-cloud-storage',
              STORAGE_PATH: 'bucket',
            },
          } as const
          const app = createApp(appOptions)
          if (scenario === 'deadline' || scenario === 'stalled-write') {
            app.addHook('onRoute', (route) => {
              if (route.method === 'PUT') route.handlerTimeout = 100
            })
          }
          await app.listen({ host: '127.0.0.1', port: 0 })
          const address = app.server.address()
          assert.ok(address && typeof address !== 'string')
          const headers = {
            authorization: 'Bearer token',
            'content-type': 'application/octet-stream',
            'content-length': 4,
          }
          const response = deferred()
          let status: number | undefined
          const session =
            protocol === 'h2'
              ? connect(`http://127.0.0.1:${address.port}`)
              : undefined
          const client = session
            ? session.request({
                ...headers,
                ':method': 'PUT',
                ':path': '/v8/artifacts/artifact?team=team',
              })
            : httpRequest({
                host: '127.0.0.1',
                port: address.port,
                method: 'PUT',
                path: '/v8/artifacts/artifact?team=team',
                headers,
                agent: false,
              })
          if (session) {
            client.on('response', (headers) => {
              status = Number(headers[':status'])
              response.resolve()
            })
            client.on('data', () => {})
          } else {
            client.on('response', (reply) => {
              status = reply.statusCode
              reply.resume()
              response.resolve()
            })
          }
          client.on('error', () => {})
          session?.on('error', () => {})
          let closing: Promise<void> | undefined
          try {
            if (scenario === 'incomplete' || scenario === 'stalled-write')
              client.write('x')
            else client.end('body')
            await within(storage.written.promise)
            if (scenario !== 'incomplete' && scenario !== 'stalled-write')
              await within(storage.final.promise)
            if (scenario === 'normal') {
              await new Promise<void>((resolve) => setImmediate(resolve))
              assert.equal(storage.sink.destroyed, false)
              storage.cleanup.resolve()
              storage.publish()
              await within(response.promise)
              assert.equal(status, 200)
            } else {
              if (scenario === 'committed-lost-ack') {
                // The storage service committed a complete winner before its acknowledgement.
                storage.publish()
                assert.equal(storage.published, true)
              }
              if (
                ['incomplete', 'response-loss', 'committed-lost-ack'].includes(
                  scenario,
                )
              ) {
                if ('close' in client) client.close(constants.NGHTTP2_CANCEL)
                else client.destroy()
              }
              let closed = false
              if (scenario === 'shutdown')
                closing = app.close().then(() => {
                  closed = true
                })
              await within(storage.destroying.promise)
              await new Promise<void>((resolve) => setImmediate(resolve))
              assert.equal(closed, false)
              assert.equal(
                logs.some(
                  (log) => log.msg === 'Artifact upload locally settled',
                ),
                false,
              )
              storage.cleanup.resolve()
            }
            await within(settled.promise)
            if (scenario === 'deadline' || scenario === 'stalled-write') {
              await within(response.promise)
              assert.equal(status, 412)
            }
            assert.equal(
              storage.published,
              scenario === 'normal' || scenario === 'committed-lost-ack',
            )
            const log = logs.find(
              (log) => log.msg === 'Artifact upload locally settled',
            )
            assert.equal(log?.settlement, 'local')
            assert.equal(typeof log?.reqId, 'string')
            if (scenario === 'deadline' || scenario === 'stalled-write')
              assert.equal(log?.cause, 'deadline')
          } finally {
            storage.cleanup.resolve()
            storage.sink.destroy()
            client.destroy()
            session?.destroy()
            await within(closing ?? app.close())
          }
        })
      }
    }
  },
)

test(
  'short handlerTimeout includes delayed hooks after normal HTTP/1 input EOF',
  { timeout: 5000 },
  async (context) => {
    const storage = controlledSink()
    storage.cleanup.resolve()
    context.mock.method(Storage.prototype, 'bucket', () => ({
      file: () => ({
        interceptors: [],
        createWriteStream: () => storage.sink,
      }),
    }))
    const app = createApp({
      logger: false,
      handlerTimeout: 400,
      configOverrides: {
        NODE_ENV: 'test',
        TURBO_TOKEN: 'token',
        STORAGE_PROVIDER: 'google-cloud-storage',
        STORAGE_PATH: 'bucket',
      },
    })
    app.addHook('onRequest', async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 250))
    })
    let client: ReturnType<typeof httpRequest> | undefined
    context.after(async () => {
      storage.sink.destroy()
      client?.destroy()
      await app.close()
    })
    await app.listen({ host: '127.0.0.1', port: 0 })
    const address = app.server.address()
    assert.ok(address && typeof address !== 'string')
    const response = new Promise<number | undefined>((resolve, reject) => {
      client = httpRequest(
        {
          host: '127.0.0.1',
          port: address.port,
          method: 'PUT',
          path: '/v8/artifacts/artifact?team=team',
          agent: false,
          headers: {
            authorization: 'Bearer token',
            'content-type': 'application/octet-stream',
            'content-length': 4,
          },
        },
        (reply) => {
          reply.resume()
          reply.on('end', () => resolve(reply.statusCode))
        },
      )
      client.on('error', reject)
      client.end('body')
    })
    await within(storage.final.promise)
    const finalizationTimer = setTimeout(storage.publish, 250)
    context.after(() => clearTimeout(finalizationTimer))
    assert.equal(await within(response), 412)
    assert.equal(storage.published, false)
    assert.equal(storage.sink.destroyed, true)
  },
)
