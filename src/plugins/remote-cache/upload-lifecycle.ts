import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

const UPLOAD_TIMEOUT_MS = 270_000
type Cause =
  | 'input_aborted'
  | 'response_closed'
  | 'deadline'
  | 'shutdown'
  | 'storage'
type UploadWork = {
  signal: AbortSignal
  join: (tasks: Promise<void>[]) => Promise<void>
}

function createUploadScope(request: FastifyRequest, reply: FastifyReply) {
  const controller = new AbortController()
  let cause: Cause | undefined
  const abort = (reason: Cause) => {
    if (controller.signal.aborted) return
    cause = reason
    controller.abort(new Error(`Artifact upload stopped: ${reason}`))
  }
  const onAborted = () => abort('input_aborted')
  const onInputClose = () => {
    if (!request.raw.complete) abort('input_aborted')
  }
  const onResponseClose = () => {
    if (!reply.raw.writableFinished) abort('response_closed')
  }
  request.raw.on('aborted', onAborted)
  request.raw.on('close', onInputClose)
  reply.raw.on('close', onResponseClose)
  // Fastify 5 clears its handler timer on input close, including normal EOF.
  const configuredTimeout = request.routeOptions.handlerTimeout
  const nativeSignal = configuredTimeout > 0 ? request.signal : undefined
  const onNativeAbort = () => {
    if (nativeSignal?.reason?.code === 'FST_ERR_HANDLER_TIMEOUT')
      abort('deadline')
  }
  nativeSignal?.addEventListener('abort', onNativeAbort)
  if (nativeSignal?.aborted) onNativeAbort()
  const timeout =
    configuredTimeout > 0
      ? Math.min(UPLOAD_TIMEOUT_MS, configuredTimeout - reply.elapsedTime)
      : UPLOAD_TIMEOUT_MS
  const timer = setTimeout(() => abort('deadline'), Math.max(0, timeout))
  timer.unref()
  if (timeout <= 0) abort('deadline')
  if (request.raw.aborted) onAborted()

  return {
    abort,
    get cause() {
      return cause
    },
    signal: controller.signal,
    async join(tasks: Promise<void>[]) {
      let failed = false
      let failure: unknown
      await Promise.allSettled(
        tasks.map((task) =>
          task.catch((error) => {
            if (!failed) {
              failed = true
              failure = error
            }
            abort('storage')
            throw error
          }),
        ),
      )
      if (failed) throw failure
      controller.signal.throwIfAborted()
    },
    dispose() {
      clearTimeout(timer)
      request.raw.removeListener('aborted', onAborted)
      request.raw.removeListener('close', onInputClose)
      reply.raw.removeListener('close', onResponseClose)
      nativeSignal?.removeEventListener('abort', onNativeAbort)
    },
  }
}

export function registerUploadLifecycle(instance: FastifyInstance) {
  const active = new Map<ReturnType<typeof createUploadScope>, Promise<void>>()
  let closing = false
  const uploads = {
    async run(
      request: FastifyRequest,
      reply: FastifyReply,
      work: (upload: UploadWork) => Promise<void>,
    ) {
      const scope = createUploadScope(request, reply)
      let release = () => {}
      const done = new Promise<void>((resolve) => {
        release = resolve
      })
      active.set(scope, done)
      if (closing) scope.abort('shutdown')
      let completed = false
      try {
        scope.signal.throwIfAborted()
        await work(scope)
        completed = true
      } catch (error) {
        scope.abort('storage')
        throw error
      } finally {
        scope.dispose()
        active.delete(scope)
        const fields = {
          reqId: request.id,
          outcome: completed ? 'completed' : 'failed',
          cause: scope.cause ?? 'none',
          settlement: 'local',
        }
        request.log.info(fields, 'Artifact upload locally settled')
        release()
      }
    },
  }
  instance.decorate('uploads', uploads)
  instance.addHook('preClose', async () => {
    closing = true
    for (const scope of active.keys()) scope.abort('shutdown')
    await Promise.allSettled(active.values())
  })
}

declare module 'fastify' {
  interface FastifyInstance {
    uploads: {
      run: (
        request: FastifyRequest,
        reply: FastifyReply,
        work: (upload: UploadWork) => Promise<void>,
      ) => Promise<void>
    }
  }
}
