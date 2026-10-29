import assert from 'node:assert/strict'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, describe, test } from 'node:test'
import { createS3 } from '../src/plugins/remote-cache/storage/s3.js'

type RecordedRequest = { method: string; url: string; aborted?: boolean }

function createFakeS3() {
  const requests: RecordedRequest[] = []
  let slow = false

  const server = http.createServer((req, res) => {
    const url = req.url ?? ''
    const record: RecordedRequest = { method: req.method ?? '', url }
    requests.push(record)
    res.on('close', () => {
      record.aborted = !res.writableEnded
    })

    req.on('end', () => {
      if (req.method === 'GET') {
        if (slow) {
          res.writeHead(200, { 'content-type': 'application/octet-stream' })
          res.write('chunk-1')
          return
        }
        res.writeHead(200, { 'content-type': 'application/octet-stream' })
        res.end('full-content')
        return
      }
      res.writeHead(200)
      res.end()
    })
    req.resume()
  })

  return {
    server,
    requests,
    setSlow: (v: boolean) => {
      slow = v
    },
  }
}

describe('S3 download abort on stream destroy', async () => {
  const { server, requests, setSlow } = createFakeS3()
  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve()),
  )
  const { port } = server.address() as AddressInfo

  after(async () => {
    // The SDK keeps idle sockets open, and close() waits for them.
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  const store = createS3({
    bucket: 'bucket',
    region: 'us-east-1',
    endpoint: `http://127.0.0.1:${port}`,
    accessKey: 'test',
    secretKey: 'test',
  })

  test('successful download reads full content', async () => {
    setSlow(false)
    const stream = store.createReadStream('item-1')
    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk))
    }
    assert.equal(Buffer.concat(chunks).toString(), 'full-content')
  })

  test('destroying the stream mid-download closes the S3 response', async () => {
    setSlow(true)
    requests.length = 0
    const stream = store.createReadStream('item-slow')

    // Wait for the first chunk to arrive
    await new Promise<void>((resolve) => {
      stream.once('data', () => resolve())
    })

    // Destroy stream mid-download
    stream.destroy()

    // Wait for the underlying connection to close
    const deadline = Date.now() + 3000
    while (!requests[0]?.aborted) {
      if (Date.now() > deadline) {
        assert.fail('Expected request to be aborted on stream destroy')
      }
      await new Promise((resolve) => setTimeout(resolve, 20))
    }

    assert.equal(requests[0].aborted, true)
  })

  test('destroying the stream immediately before response resolves cleans up', async () => {
    setSlow(true)
    requests.length = 0
    const stream = store.createReadStream('item-instant-destroy')
    stream.destroy()

    // Allow microtasks and connection to settle
    await new Promise((resolve) => setTimeout(resolve, 100))

    // The abort can stop the GET before it is sent. If the GET reaches the
    // server, the server must see the connection close before the response ends.
    const deadline = Date.now() + 3000
    while (requests.some((r) => r.aborted !== true)) {
      if (Date.now() > deadline) {
        assert.fail('Expected every request to be aborted on stream destroy')
      }
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  })
})
