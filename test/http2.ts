import assert from 'node:assert/strict'
import { test } from 'node:test'

const baseTestEnv = {
  NODE_ENV: 'test',
  PORT: 3000,
  LOG_LEVEL: 'info',
  LOG_MODE: 'stdout',
  LOG_FILE: 'server.log',
  TURBO_TOKEN: 'changeme',
  STORAGE_PROVIDER: 'local',
  STORAGE_PATH: 'test-storage',
}

test('HTTP2 configuration tests', async (t) => {
  await t.test(
    'HTTP2: should create app with HTTP2 disabled by default',
    async (t) => {
      /**
       * MOCKS
       */
      // Explicitly set HTTP2 to false to test default state
      const testEnv = { ...baseTestEnv, HTTP2: false }
      Object.assign(process.env, testEnv)
      const { env } = await import('../src/env.js')
      t.mock.method(env, 'get', () => {
        return testEnv
      })
      /**
       * END MOCKS
       */
      const { createApp } = await import('../src/app.js')
      const app = createApp({ logger: false })

      // Test the app instance was created
      assert.ok(app)

      // When HTTP2 env var is false, app.initialConfig.http2 should be undefined
      const serverOptions = app.initialConfig
      assert.equal(serverOptions.http2, undefined)
    },
  )

  await t.test(
    'HTTP2: should create app with HTTP2 enabled when HTTP2=true',
    async (t) => {
      /**
       * MOCKS
       */
      const testEnv = { ...baseTestEnv, HTTP2: true }
      Object.assign(process.env, testEnv)
      const { env } = await import('../src/env.js')
      t.mock.method(env, 'get', () => {
        return testEnv
      })
      /**
       * END MOCKS
       */
      const { createApp } = await import('../src/app.js')
      const app = createApp({ logger: false })

      // Test the app instance was created
      assert.ok(app)

      // HTTP2 should be enabled
      const serverOptions = app.initialConfig
      assert.equal(serverOptions.http2, true)
    },
  )

  await t.test(
    'HTTP2: should allow direct override of HTTP2 option',
    async (t) => {
      /**
       * MOCKS
       */
      // Set env to false this time, and we'll override with http2: true
      const testEnv = { ...baseTestEnv, HTTP2: false }
      Object.assign(process.env, testEnv)
      const { env } = await import('../src/env.js')
      t.mock.method(env, 'get', () => {
        return testEnv
      })
      /**
       * END MOCKS
       */
      const { createApp } = await import('../src/app.js')

      // Create app with http2: true in the options
      const appOptions = {
        logger: false,
        http2: true,
      } as const

      const app = createApp(appOptions)

      // Test the app instance was created
      assert.ok(app)
      // HTTP2 should be true because we directly set it in the options and the environment variable is false, so it won't override it
      const serverOptions = app.initialConfig
      assert.equal(serverOptions.http2, true)
    },
  )
})
