import { tmpdir } from 'os'
import { join } from 'path'
import fs from 'fs-blob-store'

export type LocalOptions = {
  path: string
}

export function createLocal({ path }: LocalOptions) {
  return fs(join(tmpdir(), path))
}
