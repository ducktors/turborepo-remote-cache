import net from 'node:net'

/**
 * Sends a chunked (no `content-length`) PUT of `megabytes` MB and resolves
 * with the response status code.
 *
 * Written on a raw socket rather than `http.request` on purpose. The server
 * replies 413 and tears the connection down while the client is still
 * uploading, so the client's remaining writes fail with EPIPE/ECONNRESET —
 * and `http.request` discards an already-received response when the request
 * socket errors, making the assertion race the upload. Reading the raw
 * response bytes ourselves means the status line is captured whenever it
 * arrives, regardless of how the write side ends.
 */
export function putChunked(
  port: number,
  path: string,
  megabytes: number,
  timeoutMs = 15000,
): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1')
    let response = ''
    let settled = false

    const timer = setTimeout(() => {
      finish(new Error('timed out waiting for response'))
    }, timeoutMs)

    function finish(err: Error | null, statusCode?: number) {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      socket.destroy()
      err ? reject(err) : resolve(statusCode as number)
    }

    socket.on('data', (data) => {
      response += data.toString('latin1')
      const match = response.match(/^HTTP\/1\.\d (\d{3})/)
      if (match) {
        finish(null, Number(match[1]))
      }
    })
    // Expected once the server resets the connection after replying.
    socket.on('error', () => {})
    socket.on('close', () => {
      finish(new Error(`connection closed without a response: ${response}`))
    })

    socket.write(
      [
        `PUT ${path} HTTP/1.1`,
        'Host: 127.0.0.1',
        'Content-Type: application/octet-stream',
        'Transfer-Encoding: chunked',
        'Connection: close',
        '',
        '',
      ].join('\r\n'),
    )

    const chunk = Buffer.alloc(1024 * 1024, 1)
    const header = Buffer.from(`${chunk.length.toString(16)}\r\n`, 'latin1')
    const trailer = Buffer.from('\r\n', 'latin1')
    let written = 0
    const writeNext = () => {
      if (settled) {
        return
      }
      if (written >= megabytes) {
        socket.write('0\r\n\r\n')
        return
      }
      written += 1
      socket.write(Buffer.concat([header, chunk, trailer]), () =>
        setImmediate(writeNext),
      )
    }
    writeNext()
  })
}
