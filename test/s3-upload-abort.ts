import assert from 'node:assert/strict'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { Readable, Transform, pipeline as pipelineCallback } from 'node:stream'
import { after, describe, test } from 'node:test'
import { promisify } from 'node:util'

const pipeline = promisify(pipelineCallback)
const ONE_MB = 1024 * 1024
const PART_SIZE_MB = 5

type RecordedRequest = { method: string; url: string }

/**
 * Minimal S3 stand-in that records the commands it receives.
 *
 * s3rver is used elsewhere for happy-path coverage, but this test asserts on
 * the exact sequence of multipart commands, so it needs a backend it can
 * observe request-by-request.
 */
function createFakeS3() {
  const requests: RecordedRequest[] = []
  const server = http.createServer((req, res) => {
    const url = req.url ?? ''
    requests.push({ method: req.method ?? '', url })
    req.resume()

    const respond = (status: number, body = '', headers = {}) => {
      res.writeHead(status, { 'content-type': 'application/xml', ...headers })
      res.end(body)
    }

    req.on('end', () => {
      if (req.method === 'POST' && url.includes('uploads')) {
        respond(
          200,
          '<?xml version="1.0" encoding="UTF-8"?><InitiateMultipartUploadResult><Bucket>bucket</Bucket><Key>key</Key><UploadId>test-upload-id</UploadId></InitiateMultipartUploadResult>',
        )
        return
      }
      if (req.method === 'PUT') {
        respond(200, '', { etag: '"deadbeef"' })
        return
      }
      if (req.method === 'DELETE') {
        respond(204)
        return
      }
      if (req.method === 'POST') {
        respond(
          200,
          '<?xml version="1.0" encoding="UTF-8"?><CompleteMultipartUploadResult><Location>http://localhost/bucket/key</Location></CompleteMultipartUploadResult>',
        )
        return
      }
      respond(200)
    })
  })
  return { server, requests }
}

describe('S3 upload abort on stream destroy', async () => {
  const { server, requests } = createFakeS3()
  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve()),
  )
  const { port } = server.address() as AddressInfo

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  const { createS3 } = await import('../src/plugins/remote-cache/storage/s3.js')
  const store = createS3({
    bucket: 'bucket',
    region: 'us-east-2',
    endpoint: `http://127.0.0.1:${port}`,
    accessKey: 'test',
    secretKey: 'test',
  })

  /** Emits 1 MB chunks and fails once more than `limitMb` MB have passed. */
  function sizeLimit(limitMb: number) {
    let seen = 0
    return new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        seen += chunk.length
        if (seen > limitMb * ONE_MB) {
          callback(new Error('Request body is too large'))
          return
        }
        callback(null, chunk)
      },
    })
  }

  /**
   * Emits `count` 1 MB chunks, optionally pacing them. Pacing matters for the
   * abort case: lib-storage only issues CreateMultipartUpload once it has
   * buffered a full part, so a source that produces every chunk in one tick
   * can breach the size limit before any request reaches the backend, leaving
   * nothing to abort.
   */
  const megabytes = (count: number, gapMs = 0) =>
    Readable.from(
      (async function* () {
        for (let i = 0; i < count; i++) {
          if (gapMs) {
            await new Promise((resolve) => setTimeout(resolve, gapMs))
          }
          yield Buffer.alloc(ONE_MB, 1)
        }
      })(),
    )

  await test('destroying the writable aborts the multipart upload', async () => {
    // pipeline() destroys the destination when an upstream stage fails, and
    // destruction skips final(). Unless destroy() propagates, the internal
    // PassThrough feeding @aws-sdk/lib-storage is never ended and
    // upload.abort() is never called, so the parts already uploaded linger in
    // the bucket accruing storage cost until a lifecycle rule reaps them.
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)
    requests.length = 0

    // Breach the limit only after the first part has been uploaded, so there
    // is a live multipart upload to abort.
    await assert.rejects(
      pipeline(
        megabytes(PART_SIZE_MB + 3, 50),
        sizeLimit(PART_SIZE_MB + 1),
        store.createWriteStream('key'),
      ),
      /too large/i,
    )

    // Let the fire-and-forget abort reach the backend.
    await new Promise((resolve) => setTimeout(resolve, 500))
    process.off('unhandledRejection', onUnhandled)

    const methods = requests.map((r) => r.method)
    assert.ok(
      requests.some((r) => r.method === 'POST' && r.url.includes('uploads')),
      `expected a CreateMultipartUpload, got ${methods.join(', ')}`,
    )
    assert.ok(
      requests.some(
        (r) => r.method === 'DELETE' && r.url.includes('uploadId='),
      ),
      `expected an AbortMultipartUpload, got ${methods.join(', ')}`,
    )
    assert.ok(
      !requests.some(
        (r) =>
          r.method === 'POST' &&
          r.url.includes('uploadId=') &&
          !r.url.includes('uploads'),
      ),
      'aborted upload must not be completed',
    )
    assert.deepEqual(
      unhandled.map(String),
      [],
      'aborting the upload must not leave an unhandled rejection',
    )
  })

  await test('a successful upload still completes', async () => {
    requests.length = 0
    await pipeline(megabytes(PART_SIZE_MB + 3), store.createWriteStream('key'))

    assert.ok(
      requests.some(
        (r) =>
          r.method === 'POST' &&
          r.url.includes('uploadId=') &&
          !r.url.includes('uploads'),
      ),
      'expected a CompleteMultipartUpload',
    )
    assert.ok(
      !requests.some((r) => r.method === 'DELETE'),
      'a successful upload must not be aborted',
    )
  })
})
