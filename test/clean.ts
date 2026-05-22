import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { mkdir, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000
const storagePath = join(
  tmpdir(),
  `turborepo-remote-cache-clean-${crypto.randomBytes(8).toString('hex')}`,
)
const team = 'superteam'

const testEnv = {
  NODE_ENV: 'test',
  PORT: 3000,
  LOG_LEVEL: 'info',
  LOG_MODE: 'stdout',
  LOG_FILE: 'server.log',
  TURBO_TOKEN: ['changeme'],
  STORAGE_PROVIDER: 'local',
  STORAGE_PATH: storagePath,
  STORAGE_PATH_USE_TMP_FOLDER: false,
}

async function touchArtifact(
  artifactId: string,
  accessedAt: Date,
  teamSlug = team,
): Promise<string> {
  const teamPath = join(storagePath, teamSlug)
  await mkdir(teamPath, { recursive: true })
  const filePath = join(teamPath, artifactId)
  await writeFile(filePath, 'test cache data')
  await utimes(filePath, accessedAt, accessedAt)
  return filePath
}

test('clean endpoint', async (t) => {
  Object.assign(process.env, testEnv)
  const { env } = await import('../src/env.js')
  t.mock.method(env, 'get', () => testEnv)

  const { createApp } = await import('../src/app.js')
  const app = createApp({ logger: false })
  await app.ready()

  t.after(async () => {
    await rm(storagePath, { recursive: true, force: true })
    await app.close()
  })

  await t.test('should return 400 when slug is missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v8/clean',
      headers: {
        authorization: 'Bearer changeme',
      },
    })

    assert.equal(response.statusCode, 400)
    assert.match(response.json().message, /slug/)
  })

  await t.test('should return 400 for an invalid slug', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v8/clean',
      headers: {
        authorization: 'Bearer changeme',
      },
      query: {
        slug: '../escape',
      },
    })

    assert.equal(response.statusCode, 400)
    assert.equal(response.json().message, 'Invalid slug')
  })

  await t.test('should return 400 when authorization is missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v8/clean',
      query: {
        slug: team,
      },
    })

    assert.equal(response.statusCode, 400)
    assert.equal(response.json().message, 'Missing Authorization header')
  })

  await t.test(
    'should return zero counts when the team folder does not exist',
    async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v8/clean',
        headers: {
          authorization: 'Bearer changeme',
        },
        query: {
          slug: 'missing-team',
        },
      })

      assert.equal(response.statusCode, 200)
      assert.deepEqual(response.json(), { deleted: 0, scanned: 0 })
    },
  )

  await t.test(
    'should delete artifacts accessed before the default retention window',
    async () => {
      const defaultTeam = 'default-window'
      const staleArtifactId = crypto.randomBytes(20).toString('hex')
      const freshArtifactId = crypto.randomBytes(20).toString('hex')
      const staleAccessedAt = new Date(Date.now() - 11 * MILLISECONDS_PER_DAY)
      const freshAccessedAt = new Date(Date.now() - 5 * MILLISECONDS_PER_DAY)

      await touchArtifact(staleArtifactId, staleAccessedAt, defaultTeam)
      await touchArtifact(freshArtifactId, freshAccessedAt, defaultTeam)

      const response = await app.inject({
        method: 'POST',
        url: '/v8/clean',
        headers: {
          authorization: 'Bearer changeme',
        },
        query: {
          slug: defaultTeam,
        },
      })

      assert.equal(response.statusCode, 200)
      assert.deepEqual(response.json(), { deleted: 1, scanned: 2 })

      const staleResponse = await app.inject({
        method: 'HEAD',
        url: `/v8/artifacts/${staleArtifactId}`,
        headers: {
          authorization: 'Bearer changeme',
        },
        query: {
          team: defaultTeam,
        },
      })
      assert.equal(staleResponse.statusCode, 404)

      const freshResponse = await app.inject({
        method: 'HEAD',
        url: `/v8/artifacts/${freshArtifactId}`,
        headers: {
          authorization: 'Bearer changeme',
        },
        query: {
          team: defaultTeam,
        },
      })
      assert.equal(freshResponse.statusCode, 200)
    },
  )

  await t.test('should honor a custom olderThan value', async () => {
    const customTeam = 'custom-window'
    const staleArtifactId = crypto.randomBytes(20).toString('hex')
    const freshArtifactId = crypto.randomBytes(20).toString('hex')
    const staleAccessedAt = new Date(Date.now() - 4 * MILLISECONDS_PER_DAY)
    const freshAccessedAt = new Date(Date.now() - 1 * MILLISECONDS_PER_DAY)

    await touchArtifact(staleArtifactId, staleAccessedAt, customTeam)
    await touchArtifact(freshArtifactId, freshAccessedAt, customTeam)

    const response = await app.inject({
      method: 'POST',
      url: '/v8/clean',
      headers: {
        authorization: 'Bearer changeme',
      },
      query: {
        slug: customTeam,
        olderThan: '3',
      },
    })

    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.json(), { deleted: 1, scanned: 2 })
  })
})

test('clean endpoint with non-local storage', async (t) => {
  const nonLocalEnv = {
    ...testEnv,
    STORAGE_PROVIDER: 'S3',
    STORAGE_PATH: 'test-bucket',
  }

  Object.assign(process.env, nonLocalEnv)
  const { env } = await import('../src/env.js')
  t.mock.method(env, 'get', () => nonLocalEnv)

  const { createApp } = await import('../src/app.js')
  const app = createApp({ logger: false })
  await app.ready()

  t.after(async () => {
    await app.close()
  })

  const response = await app.inject({
    method: 'POST',
    url: '/v8/clean',
    headers: {
      authorization: 'Bearer changeme',
    },
    query: {
      slug: team,
    },
  })

  assert.equal(response.statusCode, 501)
  assert.equal(
    response.json().message,
    'Clean is only supported for the local storage provider',
  )
})
