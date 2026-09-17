import fsPromises from 'node:fs/promises'
import { tmpdir } from 'os'
import { dirname, join, normalize } from 'path'
import fs from 'fs-blob-store'
import type { StorageProvider } from './index.js'

export type LocalOptions = {
  path: string
  useTmp: boolean
}

export function getLocalRootPath({ path, useTmp }: LocalOptions): string {
  return useTmp ? join(tmpdir(), path) : normalize(path)
}

export function createLocal(options: LocalOptions): StorageProvider {
  const root = getLocalRootPath(options)
  const store = fs(root)

  // Artifact keys are POSIX-style ('/'-separated, see getArtifactPath). Map them
  // onto native filesystem paths before touching them with fs directly.
  const toNativePath = (key: string) => join(root, ...key.split('/'))

  return {
    // Delegate explicitly rather than spreading `store`: fs-blob-store exposes
    // its methods on the prototype, so an object spread silently yields an
    // object with none of them.
    exists: (artifactPath, cb) => store.exists(artifactPath, cb),
    createReadStream: (artifactPath) => store.createReadStream(artifactPath),
    createWriteStream: (artifactPath) => store.createWriteStream(artifactPath),
    /**
     * Atomically publishes `fromPath` as `toPath`. Both live under the same
     * store root, so `rename` is an atomic same-filesystem operation: readers
     * see either the previous artifact or the complete new one, never a
     * half-written file.
     */
    promote: (fromPath, toPath, cb) => {
      const target = toNativePath(toPath)
      fsPromises
        .mkdir(dirname(target), { recursive: true })
        .then(() => fsPromises.rename(toNativePath(fromPath), target))
        .then(() => cb(null))
        .catch((err) => cb(err as Error))
    },
    remove: (artifactPath, cb) => {
      fsPromises
        .rm(toNativePath(artifactPath), { force: true })
        .then(() => cb(null))
        .catch((err) => cb(err as Error))
    },
  }
}
