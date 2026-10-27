import assert from 'node:assert/strict'
import fs from 'node:fs'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough, Readable, Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { test } from 'node:test'
import { Storage } from '@google-cloud/storage'
import { isBoom } from '@hapi/boom'
import Fastify from 'fastify'
import { createApp } from '../src/app.js'
import { STORAGE_PROVIDERS } from '../src/env.js'
import { putArtifact } from '../src/plugins/remote-cache/routes/put-artifact.js'
import { createLocation } from '../src/plugins/remote-cache/storage/index.js'
import { registerUploadLifecycle } from '../src/plugins/remote-cache/upload-lifecycle.js'
import { within } from './helpers/keep-alive.js'

function deferred() {
  let resolve = () => {}
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function heldSink() {
  const final = deferred()
  const destroying = deferred()
  const cleanup = deferred()
  let fail = (_error: Error) => {}
  const sink = new Writable({
    write(_chunk, _encoding, callback) {
      callback()
    },
    final(callback) {
      fail = callback
      final.resolve()
    },
    destroy(error, callback) {
      destroying.resolve()
      cleanup.promise.then(() => callback(error))
    },
  })
  return {
    sink,
    final,
    destroying,
    cleanup,
    fail: (error: Error) => fail(error),
  }
}

function appWithStorage(
  location: Partial<ReturnType<typeof createLocation>>,
  logs: string[] = [],
) {
  const app = Fastify({
    logger: {
      stream: new Writable({
        write(chunk, _encoding, callback) {
          logs.push(chunk.toString())
          callback()
        },
      }),
    },
  })
  app.decorate('config', {
    BODY_LIMIT: 1024,
    TURBO_REMOTE_CACHE_SIGNATURE_KEY: 'key',
    HOST: '127.0.0.1',
    PORT: 0,
    JWT_SCOPE_CLAIM: 'scope',
    JWT_ROLES_CLAIM: 'roles',
  })
  app.decorate('location', location as ReturnType<typeof createLocation>)
  app.setErrorHandler((error, _request, reply) => {
    reply
      .code(isBoom(error) ? error.output.statusCode : 500)
      .send({ message: error instanceof Error ? error.message : 'Error' })
  })
  registerUploadLifecycle(app)
  app.addContentTypeParser(
    'application/octet-stream',
    (_request, payload, done) => done(null, payload),
  )
  app.route(putArtifact)
  return app
}

const request = {
  method: 'PUT' as const,
  url: '/artifacts/artifact?team=team',
  headers: {
    'content-type': 'application/octet-stream',
    'x-artifact-tag': 'private-tag',
  },
  payload: 'body',
}

test(
  'legacy siblings abort each other and all delayed cleanup is joined',
  { timeout: 5000 },
  async (parent) => {
    for (const failing of ['body', 'tag']) {
      await parent.test(`${failing} failure`, async (context) => {
        const body = heldSink()
        const tag = heldSink()
        const logs: string[] = []
        const app = appWithStorage(
          {
            createCachedArtifact: (_id, _team, source, options) =>
              pipeline(
                source,
                body.sink,
                typeof options === 'object' ? options : {},
              ),
            createCachedArtifactTag: (_id, _team, value, options) =>
              pipeline(Readable.from(value), tag.sink, options ?? {}),
          },
          logs,
        )
        context.after(async () => {
          body.cleanup.resolve()
          tag.cleanup.resolve()
          await app.close()
        })
        let returned = false
        const upload = app.inject(request).then((response) => {
          returned = true
          return response
        })
        await Promise.all([body.final.promise, tag.final.promise])
        const failed = failing === 'body' ? body : tag
        const sibling = failing === 'body' ? tag : body
        failed.fail(new Error('sensitive SDK error must not be logged'))
        await within(
          failed.destroying.promise,
          1500,
          'failed stream destruction',
        )
        failed.cleanup.resolve()
        await within(sibling.destroying.promise, 1500, 'sibling cancellation')
        await new Promise<void>((resolve) => setImmediate(resolve))
        assert.equal(returned, false)
        assert.equal(
          logs.some((line) => line.includes('Artifact upload locally settled')),
          false,
        )
        sibling.cleanup.resolve()
        const response = await within(upload, 1500, 'both pipelines settle')
        assert.equal(response.statusCode, 412)
        assert.equal(
          logs.some((line) => line.includes('sensitive SDK error')),
          false,
        )
        assert.equal(
          logs.some((line) => line.includes('private-tag')),
          false,
        )
        assert.equal(
          logs.filter((line) =>
            line.includes('Artifact upload locally settled'),
          ).length,
          1,
        )
      })
    }
  },
)

test(
  'shutdown rejects a request released from an earlier hook before constructing storage',
  { timeout: 5000 },
  async () => {
    const entered = deferred()
    const release = deferred()
    const preClose = deferred()
    let writes = 0
    const app = appWithStorage({
      createCachedArtifact: async () => {
        writes++
      },
    })
    app.addHook('onRequest', async () => {
      entered.resolve()
      await release.promise
    })
    app.addHook('preClose', async () => {
      preClose.resolve()
    })
    const upload = app.inject(request).then((response) => response)
    await within(entered.promise, 1500, 'earlier hook')
    const closing = app.close()
    await within(preClose.promise, 1500, 'preClose')
    release.resolve()
    const response = await within(upload, 1500, 'rejected admission')
    assert.equal(response.statusCode, 412, response.body)
    assert.equal(writes, 0)
    await within(closing, 1500, 'close')
    await app.close()
  },
)

test(
  'LOCAL cancellation waits for the file close before removing staging and preserves the old artifact',
  { timeout: 5000 },
  async (context) => {
    const root = await mkdtemp(join(tmpdir(), 'upload-cleanup-'))
    context.after(() => rm(root, { recursive: true, force: true }))
    const options = { path: root, useTmp: false }
    const seed = createLocation(STORAGE_PROVIDERS.LOCAL, options)
    await seed.createCachedArtifact(
      'artifact',
      'team',
      Readable.from('original'),
      1024,
    )
    // A fresh location must not inherit fs-blob-store's warmed directory cache.
    const location = createLocation(STORAGE_PROVIDERS.LOCAL, options)
    const opened = deferred()
    const releaseClose = deferred()
    const closing = deferred()
    let descriptor: number | undefined
    const originalClose = fs.close.bind(fs)
    context.mock.method(fs, 'close', (fd, callback) => {
      descriptor = fd
      closing.resolve()
      releaseClose.promise.then(() => originalClose(fd, callback))
    })
    const originalOpen = fs.open.bind(fs)
    context.mock.method(fs, 'open', (path, flags, mode, callback) => {
      originalOpen(path, flags, mode, (error, fd) => {
        callback(error, fd)
        opened.resolve()
      })
    })
    const controller = new AbortController()
    const source = new PassThrough()
    let settled = false
    const upload = location
      .createCachedArtifact('artifact', 'team', source, {
        signal: controller.signal,
      })
      .catch((error) => error)
      .finally(() => {
        settled = true
      })
    try {
      source.write('partial')
      await within(opened.promise, 1500, 'staging open')
      controller.abort()
      await within(closing.promise, 1500, 'file close entered')
      assert.ok(descriptor !== undefined)
      const fileDescriptor = descriptor
      assert.ok(fs.fstatSync(fileDescriptor).isFile())
      await new Promise<void>((resolve) => setTimeout(resolve, 30))
      assert.equal(settled, false)
      assert.ok(
        (await readdir(join(root, 'team'))).some((path) =>
          path.endsWith('.tmp'),
        ),
      )
      releaseClose.resolve()
      assert.equal(
        (await within(upload, 1500, 'staging cleanup')).code,
        'ABORT_ERR',
      )
      assert.throws(() => fs.fstatSync(fileDescriptor))
      assert.deepEqual(await readdir(join(root, 'team')), ['artifact'])
      assert.equal(
        await readFile(join(root, 'team', 'artifact'), 'utf8'),
        'original',
      )
    } finally {
      releaseClose.resolve()
      source.destroy()
      await within(upload, 1500, 'final staging cleanup')
    }
  },
)

test(
  'real application excludes sensitive SDK error data from responses and logs',
  { timeout: 5000 },
  async (context) => {
    const marker = 'fabricated-sensitive-sdk-data'
    const privateTag = 'fabricated-private-artifact-tag'
    const logs: string[] = []
    context.mock.method(Storage.prototype, 'bucket', () => ({
      file: () => ({
        interceptors: [],
        createWriteStream: () =>
          new Writable({
            write(_chunk, _encoding, callback) {
              callback(
                Object.assign(new Error(marker), {
                  response: {
                    config: { headers: { authorization: marker } },
                    sessionUri: `http://127.0.0.1/${marker}`,
                  },
                }),
              )
            },
          }),
      }),
    }))
    const app = createApp({
      logger: {
        stream: new Writable({
          write(chunk, _encoding, callback) {
            logs.push(chunk.toString())
            callback()
          },
        }),
      },
      configOverrides: {
        NODE_ENV: 'test',
        TURBO_TOKEN: 'token',
        STORAGE_PROVIDER: 'google-cloud-storage',
        STORAGE_PATH: 'bucket',
        TURBO_REMOTE_CACHE_SIGNATURE_KEY: 'fake-key',
      },
    })
    context.after(() => app.close())
    const response = await app.inject({
      method: 'PUT',
      url: '/v8/artifacts/artifact?team=team',
      headers: {
        authorization: 'Bearer token',
        'content-type': 'application/octet-stream',
        'x-artifact-tag': privateTag,
      },
      payload: 'body',
    })
    assert.equal(response.statusCode, 412)
    assert.equal((logs.join('') + response.body).includes(marker), false)
    assert.equal(logs.join('').includes(privateTag), false)
    const settled = logs
      .map((line) => JSON.parse(line))
      .filter((log) => log.msg === 'Artifact upload locally settled')
    assert.equal(settled.length, 1)
    assert.equal(settled[0].cause, 'storage')
    assert.equal(settled[0].outcome, 'failed')
    assert.equal(settled[0].settlement, 'local')
  },
)
