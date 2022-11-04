import { join } from 'path'
import dotenv from 'dotenv'
dotenv.config({ path: join(__dirname, '.env.google-cloud-storage') })
import crypto from 'crypto'
import tap from 'tap'
import fs from 'fs'
import fsbs from 'fs-blob-store'
import { tmpdir } from 'os'

class GCSMockBucket {
  path: string

  constructor(bucket: string) {
    this.path = join(tmpdir(), bucket)
    if (!fs.existsSync(this.path)) {
      fs.mkdirSync(this.path)
    }
  }

  file(filePath: string) {
    const store = fsbs(this.path)
    return {
      exists: cb => {
        return store.exists(filePath, cb)
      },
      createReadStream() {
        return store.createReadStream(filePath)
      },
      createWriteStream() {
        return store.createWriteStream(filePath)
      },
    }
  }
}

const mockApp = tap.mock('../src/app', {
  '@google-cloud/storage': {
    Storage: class MockStorage {
      bucket(name: string) {
        return new GCSMockBucket(name)
      }
    },
  },
})

tap.test('Google Cloud Storage', async t => {
  const artifactId = crypto.randomBytes(20).toString('hex')
  const teamId = 'superteam'
  const app = mockApp.createApp({ logger: false })
  await app.ready()

  t.test('should return 400 when missing authorization header', async t2 => {
    t2.plan(2)
    const response = await app.inject({
      method: 'GET',
      url: '/v8/artifacts/not-found',
      headers: {},
    })
    t2.equal(response.statusCode, 400)
    t2.equal(response.json().message, 'Missing Authorization header')
  })
  t.test('should return 401 when wrong authorization token is provided', async t2 => {
    t2.plan(2)
    const response = await app.inject({
      method: 'GET',
      url: '/v8/artifacts/not-found',
      headers: {
        authorization: 'wrong token',
      },
    })
    t2.equal(response.statusCode, 401)
    t2.equal(response.json().message, 'Invalid authorization token')
  })
  t.test('should return 400 when missing teamId query parameter', async t2 => {
    t2.plan(2)
    const response = await app.inject({
      method: 'GET',
      url: '/v8/artifacts/not-found',
      headers: {
        authorization: 'Bearer changeme',
      },
    })
    t2.equal(response.statusCode, 400)
    t2.equal(response.json().message, "querystring should have required property 'teamId'")
  })
  t.test('should return 404 on cache miss', async t2 => {
    t2.plan(2)
    const response = await app.inject({
      method: 'GET',
      url: '/v8/artifacts/not-found',
      headers: {
        authorization: 'Bearer changeme',
      },
      query: {
        teamId: 'superteam',
      },
    })
    t2.equal(response.statusCode, 404)
    t2.equal(response.json().message, 'Artifact not found')
  })
  t.test('should upload an artifact', async t2 => {
    t2.plan(2)
    const response = await app.inject({
      method: 'PUT',
      url: `/v8/artifacts/${artifactId}`,
      headers: {
        authorization: 'Bearer changeme',
        'content-type': 'application/octet-stream',
      },
      query: {
        teamId,
      },
      payload: Buffer.from('test cache data'),
    })
    t2.equal(response.statusCode, 200)
    t2.same(response.json(), { urls: [`${teamId}/${artifactId}`] })
  })
  t.test('should download an artifact', async t2 => {
    t2.plan(2)
    const response = await app.inject({
      method: 'GET',
      url: `/v8/artifacts/${artifactId}`,
      headers: {
        authorization: 'Bearer changeme',
      },
      query: {
        teamId,
      },
    })
    t2.equal(response.statusCode, 200)
    t2.same(response.body, 'test cache data')
  })
  t.test('should verify artifact exists', async t2 => {
    t2.plan(2)
    const response = await app.inject({
      method: 'HEAD',
      url: `/v8/artifacts/${artifactId}`,
      headers: {
        authorization: 'Bearer changeme',
      },
      query: {
        teamId,
      },
    })
    t2.equal(response.statusCode, 200)
    t2.same(response.body, '')
  })
  t.test('should verify artifact does not exist', async t2 => {
    t2.plan(2)
    const response = await app.inject({
      method: 'HEAD',
      url: `/v8/artifacts/not-found`,
      headers: {
        authorization: 'Bearer changeme',
      },
      query: {
        teamId,
      },
    })
    t2.equal(response.statusCode, 404)
    t2.equal(response.json().message, 'Artifact not found')
  })
  t.test('should upload an artifact when slug is used', async t2 => {
    t2.plan(2)
    const response = await app.inject({
      method: 'PUT',
      url: `/v8/artifacts/${artifactId}`,
      headers: {
        authorization: 'Bearer changeme',
        'content-type': 'application/octet-stream',
      },
      query: {
        slug: teamId,
      },
      payload: Buffer.from('test cache data'),
    })
    t2.equal(response.statusCode, 200)
    t2.same(response.json(), { urls: [`${teamId}/${artifactId}`] })
  })
  t.test('should return 200 when POST artifacts/events is called', async t2 => {
    t2.plan(2)
    const response = await app.inject({
      method: 'POST',
      url: `/v8/artifacts/events`,
      headers: {
        authorization: 'Bearer changeme',
        'content-type': 'application/octet-stream',
      },
      payload: Buffer.from('test cache data'),
    })
    t2.equal(response.statusCode, 200)
    t2.same(response.json(), {})
  })
})

dotenv.config({ path: join(__dirname, '.env.google-cloud-storage.adc'), override: true })
const mockAppADC = tap.mock('../src/app', {
  '@google-cloud/storage': {
    Storage: class MockStorage {
      bucket(name: string) {
        return new GCSMockBucket(name)
      }
    },
  },
})

tap.test('Google Cloud Storage', async t => {
  const artifactId = crypto.randomBytes(20).toString('hex')
  const teamId = 'superteam'
  const app = mockAppADC.createApp({ logger: false })
  await app.ready()

  t.test('should upload an artifact when using ADC credentials', async t2 => {
    t2.plan(2)

    const response = await app.inject({
      method: 'PUT',
      url: `/v8/artifacts/${artifactId}`,
      headers: {
        authorization: 'Bearer changeme',
        'content-type': 'application/octet-stream',
      },
      query: {
        teamId,
      },
      payload: Buffer.from('test cache data'),
    })
    t2.equal(response.statusCode, 200)
    t2.same(response.json(), { urls: [`${teamId}/${artifactId}`] })
  })
})
