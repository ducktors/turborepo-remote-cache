import { tmpdir } from 'os'
import { join, normalize } from 'path'
import fs from 'fs-blob-store'

export type LocalOptions = {
  path: string
  useTmp: boolean
}

export function createLocal({ path, useTmp }: LocalOptions) {
  const fullPath = useTmp ? join(tmpdir(), path) : normalize(path)
  return fs(fullPath)
}
