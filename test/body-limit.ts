import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

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
      // the streaming guard rather than the content-length fast path. This is
      // exercised over a real socket because app.inject() cannot model a
      // request that the server aborts mid-stream.
      const artifactId = crypto.randomBytes(20).toString('hex')
      await app.listen({ port: 0, host: '127.0.0.1' })
      const { port } = app.server.address() as AddressInfo

      const statusCode = await new Promise<number>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('timed out waiting for response')),
          5000,
        )
        const request = http.request(
          {
            host: '127.0.0.1',
            port,
            method: 'PUT',
            path: `/v8/artifacts/${artifactId}?team=superteam`,
            headers: {
              'content-type': 'application/octet-stream',
              'transfer-encoding': 'chunked',
              // Avoid a lingering keep-alive socket that would delay app.close().
              connection: 'close',
            },
          },
          (res) => {
            clearTimeout(timer)
            const statusCode = res.statusCode ?? 0
            res.resume()
            res.on('end', () => {
              request.destroy()
              resolve(statusCode)
            })
          },
        )
        // The server resets the connection after replying 413, so the client's
        // remaining writes fail with EPIPE/ECONNRESET — that is expected.
        request.on('error', () => {})

        const oneMb = Buffer.alloc(1024 * 1024, 1)
        let written = 0
        const writeNext = () => {
          if (written >= 15) {
            request.end()
            return
          }
          written += 1
          request.write(oneMb, () => setImmediate(writeNext))
        }
        writeNext()
      })

      assert.equal(statusCode, 413)
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
