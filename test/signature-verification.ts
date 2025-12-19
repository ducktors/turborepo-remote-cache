import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import type { FastifyInstance } from 'fastify'

const storagePath = join(tmpdir(), 'turborepo-remote-cache-signature-test')

describe('Artifact signature verification', async () => {
  let app: FastifyInstance
  let appWithoutSignature: FastifyInstance
  const artifactId = crypto.randomBytes(20).toString('hex')
  const artifactTag = 'test-signature-tag-12345'
  const team = 'signature-test-team'

  before(async () => {
    const { createApp } = await import('../src/app.js')

    // App with signature verification enabled
    app = createApp({
      logger: false,
      configOverrides: {
        NODE_ENV: 'test',
        PORT: 3000,
        TURBO_TOKEN: 'changeme',
        STORAGE_PROVIDER: 'local',
        STORAGE_PATH: storagePath,
        TURBO_REMOTE_CACHE_SIGNATURE_KEY: 'test-secret-key',
      },
    })
    await app.ready()

    // App without signature verification
    appWithoutSignature = createApp({
      logger: false,
      configOverrides: {
        NODE_ENV: 'test',
        PORT: 3000,
        TURBO_TOKEN: 'changeme',
        STORAGE_PROVIDER: 'local',
        STORAGE_PATH: storagePath,
      },
    })
    await appWithoutSignature.ready()
  })

  after(() => {
    rmSync(storagePath, { recursive: true, force: true })
  })

  await test('should upload artifact with signature tag', async () => {
    const response = await app.inject({
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
      payload: Buffer.from('test cache data with signature'),
    })
    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.json(), { urls: [`${team}/${artifactId}`] })
  })

  await test('should verify artifact exists with HEAD when signature tag exists', async () => {
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
  })

  await test('should download artifact with signature tag in response header', async () => {
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
    assert.equal(response.body, 'test cache data with signature')
  })

  await test('should return 404 when artifact has no signature tag but signature verification is enabled', async () => {
    // Upload an artifact without signature using the app without signature verification
    const unsignedArtifactId = crypto.randomBytes(20).toString('hex')

    await appWithoutSignature.inject({
      method: 'PUT',
      url: `/v8/artifacts/${unsignedArtifactId}`,
      headers: {
        authorization: 'Bearer changeme',
        'content-type': 'application/octet-stream',
      },
      query: {
        team,
      },
      payload: Buffer.from('unsigned artifact data'),
    })

    // Try to access it with the signature-enabled app
    const headResponse = await app.inject({
      method: 'HEAD',
      url: `/v8/artifacts/${unsignedArtifactId}`,
      headers: {
        authorization: 'Bearer changeme',
      },
      query: {
        team,
      },
    })
    assert.equal(headResponse.statusCode, 404)

    const getResponse = await app.inject({
      method: 'GET',
      url: `/v8/artifacts/${unsignedArtifactId}`,
      headers: {
        authorization: 'Bearer changeme',
      },
      query: {
        team,
      },
    })
    assert.equal(getResponse.statusCode, 404)
  })

  await test('should allow access without signature tag when signature verification is disabled', async () => {
    // Upload an artifact without signature
    const noSigArtifactId = crypto.randomBytes(20).toString('hex')

    await appWithoutSignature.inject({
      method: 'PUT',
      url: `/v8/artifacts/${noSigArtifactId}`,
      headers: {
        authorization: 'Bearer changeme',
        'content-type': 'application/octet-stream',
      },
      query: {
        team,
      },
      payload: Buffer.from('artifact without signature'),
    })

    // Access it with the app without signature verification
    const headResponse = await appWithoutSignature.inject({
      method: 'HEAD',
      url: `/v8/artifacts/${noSigArtifactId}`,
      headers: {
        authorization: 'Bearer changeme',
      },
      query: {
        team,
      },
    })
    assert.equal(headResponse.statusCode, 200)

    const getResponse = await appWithoutSignature.inject({
      method: 'GET',
      url: `/v8/artifacts/${noSigArtifactId}`,
      headers: {
        authorization: 'Bearer changeme',
      },
      query: {
        team,
      },
    })
    assert.equal(getResponse.statusCode, 200)
    assert.equal(getResponse.headers['x-artifact-tag'], undefined)
    assert.equal(getResponse.body, 'artifact without signature')
  })
})
