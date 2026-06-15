import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import type { FastifyInstance } from 'fastify'

// Avoid duplicate drive letter concatenation bug on Windows. Use absolute path without pre-joining.
const storagePath = join(tmpdir(), 'turborepo-remote-cache-cdn-test')

describe('CDN Redirect (TURBO_CACHE_READ_URL)', async () => {
  let appWithCdn: FastifyInstance
  let appWithCdnSlash: FastifyInstance
  let appWithoutCdn: FastifyInstance
  let appWithCdnAndSignature: FastifyInstance
  let appWithCdnQuery: FastifyInstance

  const artifactId = crypto.randomBytes(20).toString('hex')
  const artifactTag = 'test-cdn-tag-12345'
  const team = 'cdn-test-team'

  before(async () => {
    const { createApp } = await import('../src/app.js')

    // 1. CDN enabled (without trailing slash)
    appWithCdn = createApp({
      logger: false,
      configOverrides: {
        NODE_ENV: 'test',
        PORT: 3000,
        TURBO_TOKEN: 'changeme',
        STORAGE_PROVIDER: 'local',
        STORAGE_PATH: storagePath,
        STORAGE_PATH_USE_TMP_FOLDER: false, // Disable internal tmp folder join, use absolute path directly
        TURBO_CACHE_READ_URL: 'https://cdn.example.com',
      },
    })
    await appWithCdn.ready()

    // 2. CDN enabled (with trailing slash)
    appWithCdnSlash = createApp({
      logger: false,
      configOverrides: {
        NODE_ENV: 'test',
        PORT: 3000,
        TURBO_TOKEN: 'changeme',
        STORAGE_PROVIDER: 'local',
        STORAGE_PATH: storagePath,
        STORAGE_PATH_USE_TMP_FOLDER: false,
        TURBO_CACHE_READ_URL: 'https://cdn.example.com/',
      },
    })
    await appWithCdnSlash.ready()

    // 3. CDN disabled
    appWithoutCdn = createApp({
      logger: false,
      configOverrides: {
        NODE_ENV: 'test',
        PORT: 3000,
        TURBO_TOKEN: 'changeme',
        STORAGE_PROVIDER: 'local',
        STORAGE_PATH: storagePath,
        STORAGE_PATH_USE_TMP_FOLDER: false,
      },
    })
    await appWithoutCdn.ready()

    // 4. CDN enabled with signature verification active
    appWithCdnAndSignature = createApp({
      logger: false,
      configOverrides: {
        NODE_ENV: 'test',
        PORT: 3000,
        TURBO_TOKEN: 'changeme',
        STORAGE_PROVIDER: 'local',
        STORAGE_PATH: storagePath,
        STORAGE_PATH_USE_TMP_FOLDER: false,
        TURBO_CACHE_READ_URL: 'https://cdn.example.com',
        TURBO_REMOTE_CACHE_SIGNATURE_KEY: 'test-secret-key',
      },
    })
    await appWithCdnAndSignature.ready()

    // 5. CDN URL containing query parameters
    appWithCdnQuery = createApp({
      logger: false,
      configOverrides: {
        NODE_ENV: 'test',
        PORT: 3000,
        TURBO_TOKEN: 'changeme',
        STORAGE_PROVIDER: 'local',
        STORAGE_PATH: storagePath,
        STORAGE_PATH_USE_TMP_FOLDER: false,
        TURBO_CACHE_READ_URL: 'https://cdn.example.com/cache?token=secret',
      },
    })
    await appWithCdnQuery.ready()

    // Upload an artifact using the app with signature and CDN enabled (since PUT is a write operation, it is unaffected by the CDN read-only redirect).
    // This ensures the artifact has both the raw payload and the signature .tag file for comprehensive test coverage.
    const uploadRes = await appWithCdnAndSignature.inject({
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
      payload: Buffer.from('test cdn cache data'),
    })
    assert.equal(uploadRes.statusCode, 200)
  })

  after(() => {
    rmSync(storagePath, { recursive: true, force: true })
  })

  await test('GET: should return artifact content normally when TURBO_CACHE_READ_URL is not configured', async () => {
    const response = await appWithoutCdn.inject({
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
    assert.equal(response.body, 'test cdn cache data')
  })

  await test('HEAD: should return 200 normally with an empty body when TURBO_CACHE_READ_URL is not configured', async () => {
    const response = await appWithoutCdn.inject({
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

  await test('GET: should return 302 redirecting to CDN when TURBO_CACHE_READ_URL is configured (without trailing slash)', async () => {
    const response = await appWithCdn.inject({
      method: 'GET',
      url: `/v8/artifacts/${artifactId}`,
      headers: {
        authorization: 'Bearer changeme',
      },
      query: {
        team,
      },
    })
    assert.equal(response.statusCode, 302)
    assert.equal(
      response.headers.location,
      `https://cdn.example.com/${team}/${artifactId}`,
    )
  })

  await test('GET: should return 302 redirecting to CDN when TURBO_CACHE_READ_URL is configured (with trailing slash)', async () => {
    const response = await appWithCdnSlash.inject({
      method: 'GET',
      url: `/v8/artifacts/${artifactId}`,
      headers: {
        authorization: 'Bearer changeme',
      },
      query: {
        team,
      },
    })
    assert.equal(response.statusCode, 302)
    assert.equal(
      response.headers.location,
      `https://cdn.example.com/${team}/${artifactId}`,
    )
  })

  await test('HEAD: should return 302 redirecting to CDN when TURBO_CACHE_READ_URL is configured', async () => {
    const response = await appWithCdn.inject({
      method: 'HEAD',
      url: `/v8/artifacts/${artifactId}`,
      headers: {
        authorization: 'Bearer changeme',
      },
      query: {
        team,
      },
    })
    assert.equal(response.statusCode, 302)
    assert.equal(
      response.headers.location,
      `https://cdn.example.com/${team}/${artifactId}`,
    )
  })

  await test('GET: should correctly concatenate path and preserve query parameters when TURBO_CACHE_READ_URL contains query parameters', async () => {
    const response = await appWithCdnQuery.inject({
      method: 'GET',
      url: `/v8/artifacts/${artifactId}`,
      headers: {
        authorization: 'Bearer changeme',
      },
      query: {
        team,
      },
    })
    assert.equal(response.statusCode, 302)
    assert.equal(
      response.headers.location,
      `https://cdn.example.com/cache/${team}/${artifactId}?token=secret`,
    )
  })

  await test('GET: should include correct x-artifact-tag in redirect response when signature and CDN are both active', async () => {
    const response = await appWithCdnAndSignature.inject({
      method: 'GET',
      url: `/v8/artifacts/${artifactId}`,
      headers: {
        authorization: 'Bearer changeme',
      },
      query: {
        team,
      },
    })
    assert.equal(response.statusCode, 302)
    assert.equal(
      response.headers.location,
      `https://cdn.example.com/${team}/${artifactId}`,
    )
    assert.equal(response.headers['x-artifact-tag'], artifactTag)
  })

  await test('HEAD: should return 302 redirecting to CDN when signature and CDN are both active', async () => {
    const response = await appWithCdnAndSignature.inject({
      method: 'HEAD',
      url: `/v8/artifacts/${artifactId}`,
      headers: {
        authorization: 'Bearer changeme',
      },
      query: {
        team,
      },
    })
    assert.equal(response.statusCode, 302)
    assert.equal(
      response.headers.location,
      `https://cdn.example.com/${team}/${artifactId}`,
    )
    assert.equal(response.headers['x-artifact-tag'], artifactTag)
  })

  await test('GET: should return 404 if signature verification fails (tag missing) even when CDN is configured', async () => {
    const missingTagArtifactId = crypto.randomBytes(20).toString('hex')

    // Upload an artifact without a signature tag using the app without signature verification
    await appWithoutCdn.inject({
      method: 'PUT',
      url: `/v8/artifacts/${missingTagArtifactId}`,
      headers: {
        authorization: 'Bearer changeme',
        'content-type': 'application/octet-stream',
      },
      query: {
        team,
      },
      payload: Buffer.from('unsigned cache'),
    })

    const response = await appWithCdnAndSignature.inject({
      method: 'GET',
      url: `/v8/artifacts/${missingTagArtifactId}`,
      headers: {
        authorization: 'Bearer changeme',
      },
      query: {
        team,
      },
    })
    assert.equal(response.statusCode, 404)
  })

  await test('GET: 应当对 team 和 artifactId 进行编码以防止路径遍历重定向', async () => {
    const maliciousTeam = '../../malicious-team'
    const maliciousArtifactId = 'malicious-artifact'
    const response = await appWithCdn.inject({
      method: 'GET',
      url: `/v8/artifacts/${maliciousArtifactId}`,
      headers: {
        authorization: 'Bearer changeme',
      },
      query: {
        team: maliciousTeam,
      },
    })
    assert.equal(response.statusCode, 302)
    // 验证是否正确进行了 encode 编码，避免路径遍历逃逸
    const expectedEncodedTeam = encodeURIComponent(maliciousTeam)
    const expectedEncodedArtifact = encodeURIComponent(maliciousArtifactId)
    assert.equal(
      response.headers.location,
      `https://cdn.example.com/${expectedEncodedTeam}/${expectedEncodedArtifact}`,
    )
  })

  await test('启动: 如果 TURBO_CACHE_READ_URL 缺少 http/https scheme 应抛出校验错误', async () => {
    const { createApp } = await import('../src/app.js')
    const app = createApp({
      logger: false,
      configOverrides: {
        NODE_ENV: 'test',
        PORT: 3000,
        TURBO_TOKEN: 'changeme',
        STORAGE_PROVIDER: 'local',
        STORAGE_PATH: storagePath,
        STORAGE_PATH_USE_TMP_FOLDER: false,
        TURBO_CACHE_READ_URL: 'cdn.example.com', // 无 scheme，会被校验拦截
      },
    })
    await assert.rejects(async () => {
      await app.ready()
    })
  })
})
