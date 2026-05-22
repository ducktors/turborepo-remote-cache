import { tmpdir } from 'os'
import { join, normalize } from 'path'
import fs from 'fs-blob-store'

export type LocalOptions = {
  path: string
  useTmp: boolean
}

export function getLocalRootPath({ path, useTmp }: LocalOptions): string {
  return useTmp ? join(tmpdir(), path) : normalize(path)
}

export function createLocal(options: LocalOptions) {
  return fs(getLocalRootPath(options))
}
