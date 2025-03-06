import { tmpdir } from 'node:os'
import { join, normalize } from 'node:path'
import fs from 'fs-blob-store'

export type LocalOptions = {
  path: string
  useTmp: boolean
}

export function createLocal({ path, useTmp }: LocalOptions) {
  const fullPath = useTmp ? join(tmpdir(), path) : normalize(path)
  return fs(fullPath)
}
