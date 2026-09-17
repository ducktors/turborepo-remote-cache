import net from 'node:net'

export type RawResponse = {
  statusCode: number
  headers: Record<string, string>
}

/**
 * Settles like `promise`, but rejects if `promise` does not settle within
 * `ms`. The timer is always cleared.
 */
export async function within<T>(
  promise: Promise<T>,
  ms: number,
  what: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`timed out after ${ms} ms: ${what}`)),
          ms,
        )
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

/** Builds the request line and the headers of an HTTP/1.1 request. */
export function requestHead(method: string, path: string, headers: string[]) {
  return [
    `${method} ${path} HTTP/1.1`,
    'Host: 127.0.0.1',
    ...headers,
    '',
    '',
  ].join('\r\n')
}

/**
 * Opens an HTTP/1.1 connection on a raw socket. The client never sends
 * `Connection: close`, so the connection stays alive by default. The helper
 * parses the responses itself. Thus a test can send more requests on the same
 * socket, and it can see when the server closes the socket.
 */
export function openKeepAliveConnection(port: number) {
  const socket = net.connect(port, '127.0.0.1')
  let received = Buffer.alloc(0)
  let onChange = () => {}
  const closed = new Promise<void>((resolve) => {
    socket.once('close', () => {
      resolve()
      onChange()
    })
  })
  // The server can reset the connection while the client still writes.
  socket.on('error', () => {})
  socket.on('data', (data) => {
    received = Buffer.concat([received, data])
    onChange()
  })

  /** Resolves with the next response. Rejects if the socket closes first. */
  function nextResponse(): Promise<RawResponse> {
    return new Promise((resolve, reject) => {
      onChange = () => {
        const headEnd = received.indexOf('\r\n\r\n')
        if (headEnd !== -1) {
          const [statusLine, ...lines] = received
            .subarray(0, headEnd)
            .toString('latin1')
            .split('\r\n')
          const headers: Record<string, string> = {}
          for (const line of lines) {
            const colon = line.indexOf(':')
            headers[line.slice(0, colon).trim().toLowerCase()] = line
              .slice(colon + 1)
              .trim()
          }
          const end = headEnd + 4 + Number(headers['content-length'] ?? 0)
          if (received.length >= end) {
            received = received.subarray(end)
            onChange = () => {}
            resolve({ statusCode: Number(statusLine.split(' ')[1]), headers })
            return
          }
        }
        if (socket.destroyed) {
          reject(new Error('the connection closed before a full response'))
        }
      }
      onChange()
    })
  }

  /**
   * Sends `bytes` of body data with chunked transfer encoding, in chunks of
   * 1 MB or less. It does not send the last-chunk marker, so the body does not
   * end. Each write starts after the previous write completes.
   *
   * Make `bytes` only a little larger than the point where the server fails.
   * Then the server reads all the data before it replies, and no client write
   * is pending when the server closes the socket. A pending write fails with
   * EPIPE, and Node then destroys the socket before it reads the response.
   */
  function sendChunks(bytes: number) {
    let remaining = bytes
    const writeNext = () => {
      if (remaining === 0 || socket.destroyed) {
        return
      }
      const size = Math.min(remaining, 1024 * 1024)
      remaining -= size
      const frame = Buffer.concat([
        Buffer.from(`${size.toString(16)}\r\n`, 'latin1'),
        Buffer.alloc(size, 1),
        Buffer.from('\r\n', 'latin1'),
      ])
      socket.write(frame, () => setImmediate(writeNext))
    }
    writeNext()
  }

  return {
    closed,
    nextResponse,
    sendChunks,
    write: (data: string | Buffer) => socket.write(data),
    destroy: () => socket.destroy(),
  }
}
