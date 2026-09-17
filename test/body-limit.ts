import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Writable } from 'node:stream'
import { test } from 'node:test'
import { putChunked } from './helpers/chunked-upload.js'
import {
  openKeepAliveConnection,
  requestHead,
  within,
} from './helpers/keep-alive.js'

const ONE_MB = 1024 * 1024
const TEN_MB = 10 * 1024 * 1024

const testEnv = {
  NODE_ENV: 'test',
  PORT: 3000,
  LOG_LEVEL: 'info',
  LOG_MODE: 'stdout',
  LOG_FILE: 'server.log',
  AUTH_MODE: 'none',
  STORAGE_PROVIDER: 'local',
  STORAGE_PATH: join(tmpdir(), 'turborepo-remote-cache-test-body-limit'),
  BODY_LIMIT: TEN_MB,
}

test('BODY_LIMIT wiring', async (t) => {
  /**
   * MOCKS
   */
  Object.assign(process.env, testEnv)
  const { env } = await import('../src/env.js')
  t.mock.method(env, 'get', () => {
    return testEnv
  })
  /**
   * END MOCKS
   */
  const { createApp } = await import('../src/app.js')
  const app = createApp({ logger: false, bodyLimit: TEN_MB })
  await app.ready()
  // Listen once: the chunked-upload tests need a real socket, and fastify
  // rejects a second listen() on the same instance.
  await app.listen({ port: 0, host: '127.0.0.1' })
  const { port } = app.server.address() as AddressInfo

  await t.test('accepts payload below configured BODY_LIMIT', async () => {
    const artifactId = crypto.randomBytes(20).toString('hex')
    const response = await app.inject({
      method: 'PUT',
      url: `/v8/artifacts/${artifactId}`,
      headers: { 'content-type': 'application/octet-stream' },
      query: { team: 'superteam' },
      payload: Buffer.alloc(5 * 1024 * 1024, 1),
    })

    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.json(), {
      urls: [`superteam/${artifactId}`],
    })
  })

  await t.test(
    'rejects payload above configured BODY_LIMIT with 413',
    async () => {
      const artifactId = crypto.randomBytes(20).toString('hex')
      const response = await app.inject({
        method: 'PUT',
        url: `/v8/artifacts/${artifactId}`,
        headers: { 'content-type': 'application/octet-stream' },
        query: { team: 'superteam' },
        payload: Buffer.alloc(15 * 1024 * 1024, 1),
      })

      assert.equal(response.statusCode, 413)
      // The content-length fast path rejects with a boom 413 before any
      // streaming starts; the app error handler forwards the boom message to
      // the client instead of masking it as a generic 500.
      assert.match(response.json().message, /too large/i)
    },
  )

  await t.test(
    'rejects a chunked upload above BODY_LIMIT without content-length',
    async () => {
      // A chunked upload has no content-length, so the size must be caught by
      // the streaming guard rather than the content-length fast path.
      const artifactId = crypto.randomBytes(20).toString('hex')
      assert.equal(
        await putChunked(
          port,
          `/v8/artifacts/${artifactId}?team=superteam`,
          15,
        ),
        413,
      )
    },
  )

  await t.test(
    'leaves no artifact behind when the streaming guard rejects mid-upload',
    async () => {
      // Uploads are streamed straight to storage, so the bytes that arrive
      // before the limit is breached are already written. They must not be
      // published: otherwise HEAD reports a cache hit and GET serves a
      // truncated artifact. Writes go to a temporary key and are promoted only
      // after the whole body lands.
      const artifactId = crypto.randomBytes(20).toString('hex')
      assert.equal(
        await putChunked(
          port,
          `/v8/artifacts/${artifactId}?team=superteam`,
          15,
        ),
        413,
      )

      const head = await app.inject({
        method: 'HEAD',
        url: `/v8/artifacts/${artifactId}`,
        query: { team: 'superteam' },
      })
      assert.equal(head.statusCode, 404)

      const get = await app.inject({
        method: 'GET',
        url: `/v8/artifacts/${artifactId}`,
        query: { team: 'superteam' },
      })
      assert.equal(get.statusCode, 404)
    },
  )

  await t.test(
    'a failed overwrite preserves the already-cached artifact',
    async () => {
      // Cleanup must remove the temporary key, never the final one — deleting
      // the final key would evict a valid artifact because a later upload to
      // the same id happened to fail.
      const artifactId = crypto.randomBytes(20).toString('hex')
      const original = Buffer.alloc(1024, 7)

      const put = await app.inject({
        method: 'PUT',
        url: `/v8/artifacts/${artifactId}`,
        headers: { 'content-type': 'application/octet-stream' },
        query: { team: 'superteam' },
        payload: original,
      })
      assert.equal(put.statusCode, 200)

      assert.equal(
        await putChunked(
          port,
          `/v8/artifacts/${artifactId}?team=superteam`,
          15,
        ),
        413,
      )

      const get = await app.inject({
        method: 'GET',
        url: `/v8/artifacts/${artifactId}`,
        query: { team: 'superteam' },
      })
      assert.equal(get.statusCode, 200)
      assert.deepEqual(get.rawPayload, original)
    },
  )

  // Fastify closes the connection when its own body parser fails, because the
  // client can send more data. The route reads the body itself, so it must do
  // the same. Otherwise the server stops reading the socket, and the next
  // request on the same connection gets no response.
  await t.test(
    'closes a keep-alive connection when a chunked upload exceeds BODY_LIMIT',
    async (t) => {
      const connection = openKeepAliveConnection(port)
      t.after(() => connection.destroy())
      const artifactId = crypto.randomBytes(20).toString('hex')
      connection.write(
        requestHead('PUT', `/v8/artifacts/${artifactId}?team=superteam`, [
          'Content-Type: application/octet-stream',
          'Transfer-Encoding: chunked',
        ]),
      )
      // The server reads 10 MB, and then fails on the small last chunk.
      connection.sendChunks(TEN_MB + 16 * 1024)

      const response = await within(connection.nextResponse(), 5000, 'a 413')
      assert.equal(response.statusCode, 413)
      await within(connection.closed, 2000, 'the server closes the socket')
      assert.equal(response.headers.connection, 'close')
    },
  )

  await t.test(
    'closes a keep-alive connection when content-length exceeds BODY_LIMIT',
    async (t) => {
      // The client sends only a small part of the declared body. The socket
      // closes only if the server does not wait for the remaining bytes.
      const connection = openKeepAliveConnection(port)
      t.after(() => connection.destroy())
      const artifactId = crypto.randomBytes(20).toString('hex')
      connection.write(
        requestHead('PUT', `/v8/artifacts/${artifactId}?team=superteam`, [
          'Content-Type: application/octet-stream',
          `Content-Length: ${15 * ONE_MB}`,
        ]),
      )
      connection.write(Buffer.alloc(64 * 1024, 1))

      const response = await within(connection.nextResponse(), 2000, 'a 413')
      assert.equal(response.statusCode, 413)
      await within(connection.closed, 2000, 'the server closes the socket')
      assert.equal(response.headers.connection, 'close')
    },
  )

  await t.test(
    'closes a keep-alive connection when storage fails before the body ends',
    async (t) => {
      // fs-blob-store gets its file stream from `fs.createWriteStream`. This
      // stub fails after 1 MB, so the upload fails partway through the body.
      t.mock.method(fs, 'createWriteStream', () => {
        let written = 0
        return new Writable({
          write(chunk: Buffer, _encoding, callback) {
            written += chunk.length
            callback(written > ONE_MB ? new Error('disk failure') : null)
          },
        })
      })
      const connection = openKeepAliveConnection(port)
      t.after(() => connection.destroy())
      const artifactId = crypto.randomBytes(20).toString('hex')
      connection.write(
        requestHead('PUT', `/v8/artifacts/${artifactId}?team=superteam`, [
          'Content-Type: application/octet-stream',
          'Transfer-Encoding: chunked',
        ]),
      )
      // The stub reads 1 MB, and then fails on the small last chunk.
      connection.sendChunks(ONE_MB + 16 * 1024)

      const response = await within(connection.nextResponse(), 5000, 'a 412')
      assert.equal(response.statusCode, 412)
      await within(connection.closed, 2000, 'the server closes the socket')
      assert.equal(response.headers.connection, 'close')
    },
  )

  await t.test(
    'keeps a keep-alive connection usable after a successful upload',
    async (t) => {
      const connection = openKeepAliveConnection(port)
      t.after(() => connection.destroy())
      const artifactId = crypto.randomBytes(20).toString('hex')
      const body = Buffer.alloc(1024, 1)
      connection.write(
        requestHead('PUT', `/v8/artifacts/${artifactId}?team=superteam`, [
          'Content-Type: application/octet-stream',
          `Content-Length: ${body.length}`,
        ]),
      )
      connection.write(body)

      const put = await within(connection.nextResponse(), 2000, 'a 200')
      assert.equal(put.statusCode, 200)
      assert.notEqual(put.headers.connection, 'close')

      connection.write(requestHead('GET', '/v8/artifacts/status', []))
      const status = await within(
        connection.nextResponse(),
        2000,
        'a response to the second request on the socket',
      )
      assert.equal(status.statusCode, 200)
    },
  )

  await t.test(
    'resolveBodyLimit falls back to default on invalid input',
    async () => {
      const { resolveBodyLimit, BODY_LIMIT_DEFAULT } = await import(
        '../src/env.js'
      )

      const invalidInputs: unknown[] = [
        Number.NaN,
        0,
        -1,
        Number.POSITIVE_INFINITY,
        'not-a-number',
        undefined,
        null,
      ]
      for (const input of invalidInputs) {
        const { value, warning } = resolveBodyLimit(input)
        assert.equal(
          value,
          BODY_LIMIT_DEFAULT,
          `expected fallback for input ${String(input)}`,
        )
        assert.ok(warning, `expected warning for input ${String(input)}`)
      }

      const valid = resolveBodyLimit(TEN_MB)
      assert.equal(valid.value, TEN_MB)
      assert.equal(valid.warning, undefined)
    },
  )

  await app.close()
})
