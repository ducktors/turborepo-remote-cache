import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { join as pathJoin } from 'node:path'
import { test } from 'node:test'
import type { Config } from '../src/env.js'

const packageJson = JSON.parse(
  readFileSync(pathJoin(process.cwd(), 'package.json'), 'utf8'),
)

// Number of bytes for artifact IDs
const ARTIFACT_ID_BYTE_LENGTH = 20

const storagePath = join(tmpdir(), 'turborepo-remote-cache-test')

// Define the base config with a specific type to satisfy TypeScript
const baseTestConfig: Partial<Config> = {
  NODE_ENV: 'test',
  PORT: 3000,
  LOG_LEVEL: 'info',
  LOG_MODE: 'stdout',
  LOG_FILE: 'server.log',
  TURBO_TOKEN: 'changeme',
  STORAGE_PROVIDER: 'local',
  STORAGE_PATH: storagePath,
}

test('local storage provider', async (t) => {
  t.after(() => {
    // Cleanup storage directory after all tests in this block run
    rmSync(storagePath, { recursive: true, force: true })
  })

  await t.test('without signature verification', async (t) => {
    const { createApp } = await import('../src/app.js')
    const artifactId = crypto
      .randomBytes(ARTIFACT_ID_BYTE_LENGTH)
      .toString('hex')
    const team = 'superteam'
    const app = createApp({ logger: false, configOverrides: baseTestConfig })
    await app.ready()

    await t.test('loads correct env vars', async () => {
      assert.equal(app.config.STORAGE_PROVIDER, baseTestConfig.STORAGE_PROVIDER)
      assert.equal(app.config.STORAGE_PATH, baseTestConfig.STORAGE_PATH)
    })

    await t.test(
      'should return 400 when missing authorization header',
      async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/v8/artifacts/not-found',
          headers: {},
        })
        assert.equal(response.statusCode, 400)
        assert.equal(response.json().message, 'Missing Authorization header')
      },
    )

    await t.test(
      'should return 401 when wrong authorization token is provided',
      async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/v8/artifacts/not-found',
          headers: {
            authorization: 'wrong token',
          },
        })
        assert.equal(response.statusCode, 401)
        assert.equal(response.json().message, 'Invalid authorization token')
      },
    )

    await t.test(
      'should return 400 when missing team query parameter',
      async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/v8/artifacts/not-found',
          headers: {
            authorization: 'Bearer changeme',
          },
        })
        assert.equal(response.statusCode, 400)
        assert.equal(
          response.json().message,
          "querystring should have required property 'team'",
        )
      },
    )

    await t.test('should return 404 on cache miss', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v8/artifacts/not-found',
        headers: {
          authorization: 'Bearer changeme',
        },
        query: {
          team: 'superteam',
        },
      })
      assert.equal(response.statusCode, 404)
      assert.equal(response.json().message, 'Artifact not found')
    })

    await t.test('should upload an artifact', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/v8/artifacts/${artifactId}`,
        headers: {
          authorization: 'Bearer changeme',
          'content-type': 'application/octet-stream',
        },
        query: {
          team,
        },
        payload: Buffer.from('test cache data'),
      })
      assert.equal(response.statusCode, 200)
      assert.deepEqual(response.json(), { urls: [`${team}/${artifactId}`] })
    })

    await t.test('should download an artifact', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/v8/artifacts/${artifactId}`,
        headers: {
          authorization: 'Bearer changeme',
        },
        query: {
          team,
        },
      })
      assert.equal(response.statusCode, 200)
      assert.deepEqual(response.body, 'test cache data')
    })

    await t.test('should verify artifact exists', async () => {
      const response = await app.inject({
        method: 'HEAD',
        url: `/v8/artifacts/${artifactId}`,
        headers: {
          authorization: 'Bearer changeme',
        },
        query: {
          team,
        },
      })
      assert.equal(response.statusCode, 200)
      assert.equal(response.body, '')
    })

    await t.test('should verify artifact does not exist', async () => {
      const response = await app.inject({
        method: 'HEAD',
        url: '/v8/artifacts/not-found',
        headers: {
          authorization: 'Bearer changeme',
        },
        query: {
          team,
        },
      })
      assert.equal(response.statusCode, 404)
      assert.equal(response.json().message, 'Artifact not found')
    })

    await t.test('should upload an artifact when slug is used', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/v8/artifacts/${artifactId}`,
        headers: {
          authorization: 'Bearer changeme',
          'content-type': 'application/octet-stream',
        },
        query: {
          slug: team,
        },
        payload: Buffer.from('test cache data'),
      })
      assert.equal(response.statusCode, 200)
      assert.deepEqual(response.json(), { urls: [`${team}/${artifactId}`] })
    })

    await t.test(
      'should return 200 when POST artifacts/events is called',
      async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/v8/artifacts/events',
          headers: {
            authorization: 'Bearer changeme',
            'content-type': 'application/octet-stream',
          },
          payload: Buffer.from('test cache data'),
        })
        assert.equal(response.statusCode, 200)
        assert.deepEqual(response.json(), {})
      },
    )

    await t.test(
      'should return 200 when GET artifacts/status is called',
      async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/v8/artifacts/status',
        })
        assert.equal(response.statusCode, 200)
        assert.deepEqual(response.json(), {
          status: 'enabled',
          version: packageJson.version,
        })
      },
    )
  })

  await t.test('with signature verification', async (t) => {
    const signedTestConfig: Partial<Config> = {
      ...baseTestConfig,
      TURBO_REMOTE_CACHE_SIGNATURE_KEY: 'test-key',
    }

    const { createApp } = await import('../src/app.js')
    const artifactId = crypto.randomBytes(20).toString('hex')
    const artifactTag = 'test-signature'
    const team = 'superteam-signed'
    const app = createApp({
      logger: false,
      configOverrides: signedTestConfig,
    })
    await app.ready()

    await t.test(
      'should upload an artifact with a signature and then verify it exists',
      async () => {
        const putResponse = await app.inject({
          method: 'PUT',
          url: `/v8/artifacts/${artifactId}`,
          headers: {
            authorization: 'Bearer changeme',
            'content-type': 'application/octet-stream',
            'x-artifact-tag': artifactTag,
          },
          query: {
            team,
          },
          payload: Buffer.from('test cache data'),
        })

        assert.equal(putResponse.statusCode, 200)
        assert.deepEqual(putResponse.json(), {
          urls: [`${team}/${artifactId}`],
        })

        // Now, immediately verify with a HEAD request
        const headResponse = await app.inject({
          method: 'HEAD',
          url: `/v8/artifacts/${artifactId}`,
          headers: {
            authorization: 'Bearer changeme',
          },
          query: {
            team,
          },
        })

        assert.equal(
          headResponse.statusCode,
          200,
          'HEAD request should succeed after PUT',
        )
      },
    )

    await t.test('should download an artifact with a signature', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/v8/artifacts/${artifactId}`,
        headers: {
          authorization: 'Bearer changeme',
        },
        query: {
          team,
        },
      })
      assert.equal(response.statusCode, 200)
      assert.equal(response.headers['x-artifact-tag'], artifactTag)
      assert.deepEqual(response.body, 'test cache data')
    })

    await t.test(
      'should return 404 if artifact exists but signature is missing',
      async () => {
        // Create an app instance without the signature key to upload an artifact without a .tag file
        const unsignedAppConfig: Partial<Config> = { ...baseTestConfig }
        const unsignedApp = createApp({
          logger: false,
          configOverrides: unsignedAppConfig,
        })
        await unsignedApp.ready()

        const unsignedArtifactId = crypto
          .randomBytes(ARTIFACT_ID_BYTE_LENGTH)
          .toString('hex')
        await unsignedApp.inject({
          method: 'PUT',
          url: `/v8/artifacts/${unsignedArtifactId}`,
          headers: {
            authorization: 'Bearer changeme',
            'content-type': 'application/octet-stream',
          },
          query: {
            team,
          },
          payload: Buffer.from('unsigned data'),
        })

        // Now, using the signature-enabled app, try to access the unsigned artifact
        const response = await app.inject({
          method: 'HEAD',
          url: `/v8/artifacts/${unsignedArtifactId}`,
          headers: {
            authorization: 'Bearer changeme',
          },
          query: {
            team,
          },
        })

        assert.equal(response.statusCode, 404)
      },
    )
  })
})
