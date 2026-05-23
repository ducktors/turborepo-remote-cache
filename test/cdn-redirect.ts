import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import type { FastifyInstance } from 'fastify'

// 避免 Windows 上盘符重复拼接的 bug，不使用绝对路径，直接使用本地临时目录名称
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

    // 1. 启用了 CDN (无尾斜杠)
    appWithCdn = createApp({
      logger: false,
      configOverrides: {
        NODE_ENV: 'test',
        PORT: 3000,
        TURBO_TOKEN: 'changeme',
        STORAGE_PROVIDER: 'local',
        STORAGE_PATH: storagePath,
        STORAGE_PATH_USE_TMP_FOLDER: false, // 禁用内部 tmp 拼接，直接使用绝对路径
        TURBO_CACHE_READ_URL: 'https://cdn.example.com',
      },
    })
    await appWithCdn.ready()

    // 2. 启用了 CDN (有尾斜杠)
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

    // 3. 未启用 CDN
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

    // 4. 启用了 CDN 且启用了签名验证
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

    // 5. 启用了带有 query 参数的 CDN URL
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

    // 使用启用了数字签名与 CDN 的 app 上传（因为 PUT 是上传动作，不会受 CDN 只读重定向影响）
    // 这样该 artifact 既有本体数据，又有数字签名的 .tag 文件，可以全方位覆盖测试
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

  await test('GET: 当未配置 TURBO_CACHE_READ_URL 时，应该正常返回 artifact 内容', async () => {
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

  await test('HEAD: 当未配置 TURBO_CACHE_READ_URL 时，应该正常返回 200 并且没有 body', async () => {
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

  await test('GET: 配置了 TURBO_CACHE_READ_URL 时，应该返回 302 重定向到 CDN (无尾斜杠格式)', async () => {
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

  await test('GET: 配置了 TURBO_CACHE_READ_URL 时，应该返回 302 重定向到 CDN (有尾斜杠格式)', async () => {
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

  await test('HEAD: 配置了 TURBO_CACHE_READ_URL 时，应该返回 302 重定向到 CDN', async () => {
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

  await test('GET: 配置了包含 query 参数的 TURBO_CACHE_READ_URL 时，重定向应正确拼接路径并完美保留原有 query 参数', async () => {
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

  await test('GET & HEAD: 当启用签名验证且配置了 CDN 时，重定向响应中应包含正确的 x-artifact-tag', async () => {
    // 1. 验证 GET 请求
    const getResponse = await appWithCdnAndSignature.inject({
      method: 'GET',
      url: `/v8/artifacts/${artifactId}`,
      headers: {
        authorization: 'Bearer changeme',
      },
      query: {
        team,
      },
    })
    assert.equal(getResponse.statusCode, 302)
    assert.equal(
      getResponse.headers.location,
      `https://cdn.example.com/${team}/${artifactId}`,
    )
    assert.equal(getResponse.headers['x-artifact-tag'], artifactTag)

    // 2. 验证 HEAD 请求
    const headResponse = await appWithCdnAndSignature.inject({
      method: 'HEAD',
      url: `/v8/artifacts/${artifactId}`,
      headers: {
        authorization: 'Bearer changeme',
      },
      query: {
        team,
      },
    })
    assert.equal(headResponse.statusCode, 302)
    assert.equal(
      headResponse.headers.location,
      `https://cdn.example.com/${team}/${artifactId}`,
    )
  })

  await test('GET: 如果签名校验失败（tag 缺失），即使配置了 CDN 也应返回 404', async () => {
    const missingTagArtifactId = crypto.randomBytes(20).toString('hex')

    // 使用未校验签名的 app 上传一个不带 tag 的 artifact
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
})
