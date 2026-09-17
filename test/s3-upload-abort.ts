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

/** Polls `condition` every 10 ms. Fails if it is not true after 5 s. */
async function waitFor(condition: () => boolean, message: () => string) {
  const deadline = Date.now() + 5000
  while (!condition()) {
    if (Date.now() > deadline) {
      assert.fail(message())
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

/**
 * Minimal S3 stand-in that records the commands it receives.
 *
 * s3rver is used elsewhere for happy-path coverage, but this test asserts on
 * the exact sequence of multipart commands, so it needs a backend it can
 * observe request-by-request.
 */
function createFakeS3() {
  const requests: RecordedRequest[] = []
  // A test sets `uploadPartStatus` to make UploadPart requests fail.
  const backend = { uploadPartStatus: 200 }
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
      if (req.method === 'PUT' && backend.uploadPartStatus !== 200) {
        respond(
          backend.uploadPartStatus,
          '<?xml version="1.0" encoding="UTF-8"?><Error><Code>InternalError</Code><Message>Backend failure</Message></Error>',
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
  return { server, requests, backend }
}

describe('S3 upload abort on stream destroy', async () => {
  const { server, requests, backend } = createFakeS3()
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

    // Wait until the fire-and-forget abort reaches the backend. Keep the
    // unhandled rejection listener attached until the wait ends.
    await waitFor(
      () =>
        requests.some(
          (r) => r.method === 'DELETE' && r.url.includes('uploadId='),
        ),
      () =>
        `expected an AbortMultipartUpload, got ${requests
          .map((r) => r.method)
          .join(', ')}`,
    )
    process.off('unhandledRejection', onUnhandled)

    const methods = requests.map((r) => r.method)
    assert.ok(
      requests.some((r) => r.method === 'POST' && r.url.includes('uploads')),
      `expected a CreateMultipartUpload, got ${methods.join(', ')}`,
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

  await test('a failed part upload fails the pipeline', async () => {
    // When an UploadPart request fails, lib-storage stops reading the stream.
    // Unless the adapter destroys the writable with the upload error, a
    // pending write never calls back and the request stalls.
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)
    requests.length = 0
    backend.uploadPartStatus = 500

    let timer: NodeJS.Timeout | undefined
    const outcome = await Promise.race([
      pipeline(megabytes(64), store.createWriteStream('key')).then(
        () => 'resolved',
        (error: Error) => error,
      ),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve('hung'), 5000)
      }),
    ])
    clearTimeout(timer)
    backend.uploadPartStatus = 200

    assert.ok(
      outcome instanceof Error,
      `expected the pipeline to fail with the upload error, got ${outcome}`,
    )
    // lib-storage aborts the multipart upload before it rejects.
    await waitFor(
      () =>
        requests.some(
          (r) => r.method === 'DELETE' && r.url.includes('uploadId='),
        ),
      () =>
        `expected an AbortMultipartUpload, got ${requests
          .map((r) => r.method)
          .join(', ')}`,
    )
    process.off('unhandledRejection', onUnhandled)

    assert.equal(
      requests.filter((r) => r.method === 'DELETE').length,
      1,
      'the upload must be aborted exactly once',
    )
    assert.deepEqual(
      unhandled.map(String),
      [],
      'a failed upload must not leave an unhandled rejection',
    )
  })
})
