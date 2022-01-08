import { stat, readFile, writeFile, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { logger } from '../../logger'

const TURBO_CACHE_FOLDER_NAME = 'turborepocache' as const

async function getTeamContainer(teamId: string) {
  const teamContainer = join(tmpdir(), TURBO_CACHE_FOLDER_NAME, teamId)
  try {
    await stat(teamContainer)
  } catch (err) {
    logger.info(`Creating missing team folder ${teamContainer}.`)
    await mkdir(teamContainer, { recursive: true })
  }
  return teamContainer
}

export async function getCachedArtifact(artifactId: string, teamId: string) {
  const teamContainer = await getTeamContainer(teamId)
  const cachedArtifact = await readFile(join(teamContainer, artifactId))

  return cachedArtifact
}

export async function createCachedArtifact(artifactId: string, teamId: string, artifact: Buffer) {
  const teamContainer = await getTeamContainer(teamId)
  const fileName = join(teamContainer, artifactId)

  await writeFile(fileName, artifact)
  return artifactId
}

declare module 'fastify' {
  interface FastifyInstance {
    location: {
      getCachedArtifact: typeof getCachedArtifact
      createCachedArtifact: typeof createCachedArtifact
    }
  }
}
