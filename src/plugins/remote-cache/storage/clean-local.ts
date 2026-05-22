import { readdir, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

export type CleanStats = {
  deleted: number
  scanned: number
}

export async function cleanStaleLocalArtifacts(
  rootPath: string,
  team: string,
  olderThanDays: number,
): Promise<CleanStats> {
  const teamPath = join(rootPath, team)
  const cutoff = Date.now() - olderThanDays * MILLISECONDS_PER_DAY
  let deleted = 0
  let scanned = 0

  let entries: string[]
  try {
    entries = await readdir(teamPath)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { deleted, scanned }
    }
    throw err
  }

  for (const entry of entries) {
    const filePath = join(teamPath, entry)
    let fileStats
    try {
      fileStats = await stat(filePath)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        continue
      }
      throw err
    }
    if (!fileStats.isFile()) {
      continue
    }

    scanned++
    if (fileStats.atimeMs <= cutoff) {
      try {
        await unlink(filePath)
        deleted++
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          continue
        }
        throw err
      }
    }
  }

  return { deleted, scanned }
}
