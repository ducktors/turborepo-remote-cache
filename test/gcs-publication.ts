import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { PassThrough, Readable, Writable } from 'node:stream'
import { test } from 'node:test'
import { Storage } from '@google-cloud/storage'
import type { FastifyInstance } from 'fastify'
import { createApp } from '../src/app.js'
import { STORAGE_PROVIDERS } from '../src/env.js'
import { createGoogleCloudStorage } from '../src/plugins/remote-cache/storage/google-cloud-storage.js'
import { createLocation } from '../src/plugins/remote-cache/storage/index.js'

type StoredObject = {
  body: Buffer
  generation: string
  metadata: Record<string, string>
}

function deferred() {
  let resolve: () => void = () => {}
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function createBucket() {
  const objects = new Map<string, StoredObject>()
  const versions = new Map<string, StoredObject>()
  const state = {
    reads: [] as Array<{ path: string; generation?: string }>,
    writes: [] as string[],
    retainVersions: true,
    metadataError: undefined as Error | undefined,
    readError: undefined as Error | undefined,
    beforeCommit: undefined as
      | ((path: string, body: Buffer) => Promise<void>)
      | undefined,
    afterSnapshot: undefined as (() => Promise<void>) | undefined,
  }
  let sequence = 0
  function publish(path: string, body: Buffer, metadata = {}) {
    const previous = objects.get(path)
    if (previous && !state.retainVersions) {
      versions.delete(`${path}:${previous.generation}`)
    }
    const object = { body, metadata, generation: String(++sequence) }
    objects.set(path, object)
    versions.set(`${path}:${object.generation}`, object)
  }
  const missing = () => Object.assign(new Error('Not found'), { code: 404 })
  async function crossSnapshotBoundary() {
    const hook = state.afterSnapshot
    state.afterSnapshot = undefined
    await hook?.()
  }
  return {
    state,
    objects,
    publish,
    file(path: string, options?: { generation?: string }) {
      let generation = options?.generation
      const interceptors: Array<{
        request: (options: { qs: { generation?: string } }) => {
          qs: { generation?: string }
        }
      }> = []
      const current = () =>
        generation ? versions.get(`${path}:${generation}`) : objects.get(path)
      return {
        interceptors,
        exists(callback) {
          callback(null, Boolean(current()))
        },
        async getMetadata() {
          if (state.metadataError) throw state.metadataError
          const snapshot = current()
          if (!snapshot) throw missing()
          await crossSnapshotBoundary()
          return [snapshot]
        },
        createReadStream() {
          for (const interceptor of interceptors) {
            generation = interceptor.request({ qs: { generation } }).qs
              .generation
          }
          state.reads.push({ path, generation })
          return Readable.from(
            (async function* () {
              if (!path.endsWith('.tag')) await crossSnapshotBoundary()
              if (state.readError) throw state.readError
              const snapshot = current()
              if (!snapshot) throw missing()
              yield snapshot.body
            })(),
          )
        },
        createWriteStream(options?: {
          metadata?: { metadata?: Record<string, string> }
        }) {
          state.writes.push(path)
          const chunks: Buffer[] = []
          return new Writable({
            write(chunk, _encoding, callback) {
              chunks.push(Buffer.from(chunk))
              callback()
            },
            final(callback) {
              const body = Buffer.concat(chunks)
              Promise.resolve(state.beforeCommit?.(path, body))
                .then(() => publish(path, body, options?.metadata?.metadata))
                .then(() => callback(), callback)
            },
          })
        },
      }
    },
  }
}

const artifactPath = 'team/artifact'
const tagFor = (body: string) => `signature-${body}`
const request = {
  url: '/v8/artifacts/artifact?team=team',
  headers: { authorization: 'Bearer token' },
}

function put(app: FastifyInstance, body: string, signed = true) {
  return app.inject({
    ...request,
    method: 'PUT',
    headers: {
      ...request.headers,
      'content-type': 'application/octet-stream',
      ...(signed ? { 'x-artifact-tag': tagFor(body) } : {}),
    },
    payload: body,
  })
}

test('GCS coherent publication', { timeout: 15_000 }, async (parent) => {
  async function scenario(
    name: string,
    run: (
      app: FastifyInstance,
      bucket: ReturnType<typeof createBucket>,
    ) => Promise<void>,
  ) {
    await parent.test(name, async (context) => {
      const bucket = createBucket()
      context.mock.method(Storage.prototype, 'bucket', () => bucket)
      const app = createApp({
        logger: false,
        configOverrides: {
          NODE_ENV: 'test',
          TURBO_TOKEN: 'token',
          STORAGE_PROVIDER: 'google-cloud-storage',
          STORAGE_PATH: 'bucket',
          TURBO_REMOTE_CACHE_SIGNATURE_KEY: 'signature-key',
          BODY_LIMIT: 16,
        },
      })
      await app.ready()
      context.after(() => app.close())
      await run(app, bucket)
    })
  }

  await scenario(
    'conflicting PUTs publish the completing body and its tag',
    async (app, bucket) => {
      const entered = deferred()
      const release = deferred()
      bucket.state.beforeCommit = async (path, body) => {
        if (path === artifactPath && body.toString() === 'first') {
          entered.resolve()
          await release.promise
        }
      }
      const first = put(app, 'first').then((response) => response)
      await entered.promise
      try {
        assert.equal((await put(app, 'second')).statusCode, 200)
      } finally {
        release.resolve()
      }
      assert.equal((await first).statusCode, 200)
      const response = await app.inject({ ...request, method: 'GET' })
      assert.equal(response.statusCode, 200)
      assert.equal(response.body, 'first')
      assert.equal(response.headers['x-artifact-tag'], tagFor(response.body))
      // Each PUT also writes the legacy sidecar for older server versions.
      assert.deepEqual(bucket.state.writes.sort(), [
        artifactPath,
        artifactPath,
        `${artifactPath}.tag`,
        `${artifactPath}.tag`,
      ])
    },
  )

  for (const retainVersions of [true, false]) {
    await scenario(
      `GET racing overwrite (versioning=${retainVersions}) never mixes versions`,
      async (app, bucket) => {
        bucket.state.retainVersions = retainVersions
        await put(app, 'first')
        bucket.state.afterSnapshot = async () => {
          assert.equal((await put(app, 'second')).statusCode, 200)
        }
        const response = await app.inject({ ...request, method: 'GET' })
        assert.equal(response.statusCode, retainVersions ? 200 : 404)
        if (response.statusCode === 200) {
          assert.equal(response.body, 'first')
          assert.equal(
            response.headers['x-artifact-tag'],
            tagFor(response.body),
          )
        } else {
          assert.equal(response.headers['x-artifact-tag'], undefined)
        }
        assert.ok(bucket.state.reads.every((read) => read.generation))
      },
    )
  }

  await scenario(
    'failed and interrupted uploads preserve the previous signed pair',
    async (app, bucket) => {
      await put(app, 'first')
      const prior = bucket.objects.get(artifactPath)
      bucket.state.beforeCommit = async (path) => {
        if (path === artifactPath) throw new Error('Upload failed')
      }
      assert.equal((await put(app, 'second')).statusCode, 412)
      bucket.state.beforeCommit = undefined
      const interrupted = new PassThrough()
      const location = createLocation(STORAGE_PROVIDERS.GOOGLE_CLOUD_STORAGE, {
        path: 'bucket',
        clientEmail: '',
        privateKey: '',
        projectId: '',
      })
      const uploading = location.createCachedArtifact(
        'artifact',
        'team',
        interrupted,
        16,
      )
      interrupted.write('partial')
      interrupted.destroy(new Error('Client disconnected'))
      await assert.rejects(uploading, /Client disconnected/)
      assert.equal(bucket.objects.get(artifactPath), prior)
      const response = await app.inject({ ...request, method: 'GET' })
      assert.equal(response.body, 'first')
      assert.equal(response.headers['x-artifact-tag'], tagFor('first'))
    },
  )

  await scenario(
    'streaming size limit preserves the previous signed pair',
    async (app, bucket) => {
      await put(app, 'first')
      const prior = bucket.objects.get(artifactPath)
      const location = createLocation(STORAGE_PROVIDERS.GOOGLE_CLOUD_STORAGE, {
        path: 'bucket',
        clientEmail: '',
        privateKey: '',
        projectId: '',
      })
      await assert.rejects(
        location.createCachedArtifact(
          'artifact',
          'team',
          Readable.from(['too large']),
          2,
        ),
        (error: { output: { statusCode: number } }) =>
          error.output.statusCode === 413,
      )
      assert.equal(bucket.objects.get(artifactPath), prior)
    },
  )

  await scenario(
    'PUT waits for durable publication; HEAD reads no body',
    async (app, bucket) => {
      await put(app, 'first')
      const entered = deferred()
      const release = deferred()
      bucket.state.beforeCommit = async () => {
        entered.resolve()
        await release.promise
      }
      let completed = false
      const upload = put(app, 'second').then((response) => {
        completed = true
        return response
      })
      await entered.promise
      try {
        const response = await app.inject({ ...request, method: 'HEAD' })
        assert.equal(completed, false)
        assert.equal(response.statusCode, 200)
        assert.equal(response.headers['x-artifact-tag'], tagFor('first'))
        assert.equal(response.body, '')
        assert.deepEqual(bucket.state.reads, [])
      } finally {
        release.resolve()
      }
      assert.equal((await upload).statusCode, 200)
      const response = await app.inject({ ...request, method: 'GET' })
      assert.equal(response.body, 'second')
      assert.equal(response.headers['x-artifact-tag'], tagFor('second'))
    },
  )

  await scenario(
    'unsigned overwrite cannot reuse a stale sidecar tag',
    async (app, bucket) => {
      await put(app, 'first')
      bucket.publish(`${artifactPath}.tag`, Buffer.from(tagFor('first')))
      assert.equal((await put(app, 'unsigned', false)).statusCode, 200)
      for (const method of ['GET', 'HEAD'] as const) {
        const response = await app.inject({ ...request, method })
        assert.equal(response.statusCode, 404)
        assert.equal(response.headers['x-artifact-tag'], undefined)
      }
    },
  )

  await scenario(
    'legacy sidecar-only objects fail closed for signed readers',
    async (app, bucket) => {
      bucket.publish(artifactPath, Buffer.from('legacy'))
      bucket.publish(`${artifactPath}.tag`, Buffer.from('legacy-tag'))
      for (const method of ['GET', 'HEAD'] as const) {
        assert.equal((await app.inject({ ...request, method })).statusCode, 404)
      }
      app.config.TURBO_REMOTE_CACHE_SIGNATURE_KEY = undefined
      assert.equal(
        (await app.inject({ ...request, method: 'GET' })).body,
        'legacy',
      )
      assert.equal(
        (await app.inject({ ...request, method: 'HEAD' })).statusCode,
        200,
      )
      assert.equal((await put(app, 'new', false)).statusCode, 200)
      assert.equal(
        (await app.inject({ ...request, method: 'GET' })).body,
        'new',
      )
    },
  )

  await scenario(
    'signed reads bypass unversioned CDN redirects',
    async (app) => {
      app.config.TURBO_CACHE_READ_URL = 'https://cache.example.com'
      await put(app, 'first')
      for (const method of ['GET', 'HEAD'] as const) {
        const response = await app.inject({ ...request, method })
        assert.equal(response.statusCode, 200)
        assert.equal(response.headers.location, undefined)
        assert.equal(response.headers['x-artifact-tag'], tagFor('first'))
      }
      app.config.TURBO_REMOTE_CACHE_SIGNATURE_KEY = undefined
      assert.equal(
        (await app.inject({ ...request, method: 'GET' })).statusCode,
        302,
      )
    },
  )

  await scenario(
    'backend errors are not cache misses; empty bodies work',
    async (app, bucket) => {
      await put(app, '')
      assert.equal((await app.inject({ ...request, method: 'GET' })).body, '')
      bucket.state.metadataError = Object.assign(new Error('Forbidden'), {
        code: 403,
      })
      assert.equal(
        (await app.inject({ ...request, method: 'GET' })).statusCode,
        500,
      )
      assert.equal(
        (await app.inject({ ...request, method: 'HEAD' })).statusCode,
        500,
      )
      bucket.state.metadataError = undefined
      bucket.state.readError = Object.assign(new Error('Unavailable'), {
        code: 503,
      })
      assert.equal(
        (await app.inject({ ...request, method: 'GET' })).statusCode,
        500,
      )
    },
  )
})

test('GCS SDK sends the exact generation string on media reads', async (context) => {
  const generation = '9007199254740993'
  const body = Buffer.from('artifact')
  const requests: URL[] = []
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '', 'http://localhost')
    requests.push(url)
    if (url.searchParams.get('alt') === 'media') {
      const checksum = bucket.crc32cGenerator()
      checksum.update(body)
      response.setHeader('x-goog-hash', `crc32c=${checksum.toString()}`)
      response.end(body)
    } else {
      response.setHeader('content-type', 'application/json')
      response.end(
        JSON.stringify({ generation, metadata: { 'artifact-tag': 'tag' } }),
      )
    }
  })
  context.after(
    () => new Promise<void>((resolve) => server.close(() => resolve())),
  )
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const storage = new Storage({
    apiEndpoint: `http://127.0.0.1:${address.port}`,
    useAuthWithCustomEndpoint: false,
    projectId: 'test',
  })
  const bucket = storage.bucket('bucket')
  context.mock.method(Storage.prototype, 'bucket', () => bucket)
  const provider = createGoogleCloudStorage({
    bucket: 'bucket',
    clientEmail: '',
    privateKey: '',
    projectId: '',
  })
  assert.ok(provider.artifacts)
  const snapshot = await provider.artifacts.getSnapshot('team/artifact')
  assert.equal(snapshot.tag, 'tag')
  const stream = await snapshot.open()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  assert.deepEqual(Buffer.concat(chunks), body)
  assert.equal(requests.length, 2)
  assert.equal(requests[0].searchParams.get('generation'), null)
  assert.equal(requests[1].searchParams.get('generation'), generation)
})
