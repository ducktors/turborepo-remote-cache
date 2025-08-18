import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import mockJWKS from 'mock-jwks'

const jwksUrl = 'http://test.com/.well-known/jwks.json'
const jwksMock = mockJWKS.createJWKSMock('http://test.com')
const invalidJwksMock = mockJWKS.createJWKSMock('http://other.com')

const testEnv = {
  NODE_ENV: 'test',
  PORT: 3000,
  LOG_LEVEL: 'info',
  LOG_MODE: 'stdout',
  LOG_FILE: 'server.log',
  STORAGE_PROVIDER: 'local',
  STORAGE_PATH: join(tmpdir(), 'turborepo-remote-cache-test'),
  AUTH_MODE: 'jwt',
  JWKS_URL: jwksUrl,
}

Object.assign(process.env, testEnv)

let stopJwks
before(() => {
  const stopValid = jwksMock.start()
  const stopInvalid = invalidJwksMock.start()
  stopJwks = () => {
    stopValid()
    stopInvalid()
  }
})
after(() => stopJwks?.())

describe('JWT Plugin Compatibility', async () => {
  await test('JWT authentication plugin registration', async (t) => {
    const { createApp } = await import('../src/app.js')

    await t.test('should register JWT auth plugin successfully', async () => {
      const app = createApp({ logger: false })
      await app.ready()

      // Verify that the JWT authentication is working by testing a valid request
      const token = jwksMock.token({ scope: 'artifacts:read' })
      const response = await app.inject({
        method: 'GET',
        url: '/v8/artifacts/test-id',
        headers: {
          authorization: `Bearer ${token}`,
        },
        query: {
          team: 'test-team',
        },
      })

      // Should not be 401 (unauthorized) - JWT plugin should be working
      assert.notEqual(response.statusCode, 401, 'JWT plugin should be working')
    })

    await t.test('should handle missing JWKS_URL configuration', async () => {
      const app = createApp({
        logger: false,
        configOverrides: {
          JWKS_URL: undefined,
        },
      })

      try {
        await app.ready()
        assert.fail('Should have thrown an error for missing JWKS_URL')
      } catch (error) {
        assert.ok(error instanceof Error, 'Should throw an Error')
        assert.ok(
          error.message.includes('Must provide JWKS url'),
          'Error should mention missing JWKS url',
        )
      }
    })
  })

  await test('JWT token validation and user object structure', async (t) => {
    const { createApp } = await import('../src/app.js')
    const app = createApp({ logger: false })
    await app.ready()

    await t.test(
      'should properly decode JWT payload and create user object',
      async () => {
        const token = jwksMock.token({
          scope: 'artifacts:read',
          sub: 'test-user',
          // Removed iss claim since JWT_ISSUER is not configured in this test
        })

        const response = await app.inject({
          method: 'GET',
          url: '/v8/artifacts/test-id',
          headers: {
            authorization: `Bearer ${token}`,
          },
          query: {
            team: 'test-team',
          },
        })

        // The token should be valid, but we might get 404 for non-existent artifact
        // or 401 if there's an issue with the JWT. Let's check the response.
        if (response.statusCode === 401) {
          console.log('JWT token rejected:', response.body)
          assert.fail('JWT token should be valid but was rejected')
        }

        // If we get 404, that's fine - it means the JWT was valid but artifact doesn't exist
        assert.ok(
          response.statusCode === 404 || response.statusCode === 200,
          `Expected 404 (artifact not found) or 200 (success), got ${response.statusCode}`,
        )
      },
    )

    await t.test(
      'should handle JWT with scope property correctly',
      async () => {
        const token = jwksMock.token({ scope: 'artifacts:write' })

        const response = await app.inject({
          method: 'PUT',
          url: '/v8/artifacts/test-id',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/octet-stream',
          },
          query: {
            team: 'test-team',
          },
          payload: Buffer.from('test data'),
        })

        // Should not be 403 (forbidden) - token should have write scope
        assert.notEqual(
          response.statusCode,
          403,
          'Token should have write scope',
        )
      },
    )

    await t.test('should handle JWT without scope property', async () => {
      const token = jwksMock.token({ sub: 'test-user' }) // No scope

      const response = await app.inject({
        method: 'GET',
        url: '/v8/artifacts/test-id',
        headers: {
          authorization: `Bearer ${token}`,
        },
        query: {
          team: 'test-team',
        },
      })

      // Should not be 401 (unauthorized) - token should be valid even without scope
      assert.notEqual(
        response.statusCode,
        401,
        'Token should be valid without scope',
      )
    })
  })

  await test('JWT authorization scopes functionality', async (t) => {
    const { createApp } = await import('../src/app.js')
    const app = createApp({
      logger: false,
      configOverrides: {
        JWT_READ_SCOPES: 'artifacts:read,artifacts:write',
        JWT_WRITE_SCOPES: 'artifacts:write',
      },
    })
    await app.ready()

    await t.test('should allow read access with read scope', async () => {
      const token = jwksMock.token({ scope: 'artifacts:read' })

      const response = await app.inject({
        method: 'GET',
        url: '/v8/artifacts/test-id',
        headers: {
          authorization: `Bearer ${token}`,
        },
        query: {
          team: 'test-team',
        },
      })

      // Should not be 403 (forbidden) - token should have read scope
      assert.notEqual(response.statusCode, 403, 'Token should have read scope')
    })

    await t.test('should allow write access with write scope', async () => {
      const token = jwksMock.token({ scope: 'artifacts:write' })

      const response = await app.inject({
        method: 'PUT',
        url: '/v8/artifacts/test-id',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/octet-stream',
        },
        query: {
          team: 'test-team',
        },
        payload: Buffer.from('test data'),
      })

      // Should not be 403 (forbidden) - token should have write scope
      assert.notEqual(response.statusCode, 403, 'Token should have write scope')
    })

    await t.test('should deny read access without required scope', async () => {
      const token = jwksMock.token({ scope: 'other:scope' })

      const response = await app.inject({
        method: 'GET',
        url: '/v8/artifacts/test-id',
        headers: {
          authorization: `Bearer ${token}`,
        },
        query: {
          team: 'test-team',
        },
      })

      assert.equal(
        response.statusCode,
        403,
        'Should deny access without required scope',
      )
    })

    await t.test(
      'should deny write access without required scope',
      async () => {
        const token = jwksMock.token({ scope: 'artifacts:read' })

        const response = await app.inject({
          method: 'PUT',
          url: '/v8/artifacts/test-id',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/octet-stream',
          },
          query: {
            team: 'test-team',
          },
          payload: Buffer.from('test data'),
        })

        assert.equal(
          response.statusCode,
          403,
          'Should deny write access without write scope',
        )
      },
    )

    await t.test('should handle multiple scopes in token', async () => {
      const token = jwksMock.token({
        scope: 'artifacts:read artifacts:write other:scope',
      })

      // Should allow read access
      const readResponse = await app.inject({
        method: 'GET',
        url: '/v8/artifacts/test-id',
        headers: {
          authorization: `Bearer ${token}`,
        },
        query: {
          team: 'test-team',
        },
      })
      assert.notEqual(
        readResponse.statusCode,
        403,
        'Should allow read with multiple scopes',
      )

      // Should allow write access
      const writeResponse = await app.inject({
        method: 'PUT',
        url: '/v8/artifacts/test-id',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/octet-stream',
        },
        query: {
          team: 'test-team',
        },
        payload: Buffer.from('test data'),
      })
      assert.notEqual(
        writeResponse.statusCode,
        403,
        'Should allow write with multiple scopes',
      )
    })
  })

  await test('JWT error handling and edge cases', async (t) => {
    const { createApp } = await import('../src/app.js')
    const app = createApp({ logger: false })
    await app.ready()

    await t.test('should handle malformed JWT tokens', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v8/artifacts/test-id',
        headers: {
          authorization: 'Bearer malformed.token.here',
        },
        query: {
          team: 'test-team',
        },
      })

      assert.equal(response.statusCode, 401, 'Should reject malformed tokens')
    })

    await t.test('should handle invalid JWT tokens', async () => {
      const token = invalidJwksMock.token()
      const response = await app.inject({
        method: 'GET',
        url: '/v8/artifacts/test-id',
        headers: {
          authorization: `Bearer ${token}`,
        },
        query: {
          team: 'test-team',
        },
      })

      assert.equal(response.statusCode, 401, 'Should reject invalid tokens')
    })

    await t.test('should handle missing authorization header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v8/artifacts/test-id',
        query: {
          team: 'test-team',
        },
      })

      // JWT authentication returns 401 for missing auth header, not 400
      assert.equal(
        response.statusCode,
        401,
        'Should reject requests without authorization header',
      )
    })

    await t.test('should handle empty authorization header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v8/artifacts/test-id',
        headers: {
          authorization: '',
        },
        query: {
          team: 'test-team',
        },
      })

      // JWT authentication returns 401 for empty auth header, not 400
      assert.equal(
        response.statusCode,
        401,
        'Should reject requests with empty authorization header',
      )
    })

    await t.test('should handle non-Bearer authorization header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v8/artifacts/test-id',
        headers: {
          authorization: 'Basic dGVzdDp0ZXN0',
        },
        query: {
          team: 'test-team',
        },
      })

      // JWT authentication returns 401 for non-Bearer auth header, not 400
      assert.equal(
        response.statusCode,
        401,
        'Should reject non-Bearer authorization headers',
      )
    })
  })

  await test('JWT integration with storage operations', async (t) => {
    const { createApp } = await import('../src/app.js')
    const app = createApp({ logger: false })
    await app.ready()

    await t.test('should allow artifact upload with valid JWT', async () => {
      const artifactId = randomUUID()
      const team = randomUUID()
      const token = jwksMock.token({ scope: 'artifacts:write' })

      const response = await app.inject({
        method: 'PUT',
        url: `/v8/artifacts/${artifactId}`,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/octet-stream',
        },
        query: {
          team,
        },
        payload: Buffer.from('test cache data'),
      })

      assert.equal(response.statusCode, 200, 'Should allow artifact upload')
      assert.ok(response.json().urls, 'Should return URLs in response')
    })

    await t.test('should allow artifact download with valid JWT', async () => {
      const artifactId = randomUUID()
      const team = randomUUID()
      const token = jwksMock.token({ scope: 'artifacts:read' })

      // First upload an artifact
      await app.inject({
        method: 'PUT',
        url: `/v8/artifacts/${artifactId}`,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/octet-stream',
        },
        query: {
          team,
        },
        payload: Buffer.from('test cache data'),
      })

      // Then download it
      const response = await app.inject({
        method: 'GET',
        url: `/v8/artifacts/${artifactId}`,
        headers: {
          authorization: `Bearer ${token}`,
        },
        query: {
          team,
        },
      })

      assert.equal(response.statusCode, 200, 'Should allow artifact download')
      assert.ok(response.body, 'Should return artifact data')
    })

    await t.test(
      'should handle HEAD requests with JWT authentication',
      async () => {
        const artifactId = randomUUID()
        const team = randomUUID()
        const token = jwksMock.token({ scope: 'artifacts:read' })

        // First upload an artifact
        await app.inject({
          method: 'PUT',
          url: `/v8/artifacts/${artifactId}`,
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/octet-stream',
          },
          query: {
            team,
          },
          payload: Buffer.from('test cache data'),
        })

        // Then check if it exists
        const response = await app.inject({
          method: 'HEAD',
          url: `/v8/artifacts/${artifactId}`,
          headers: {
            authorization: `Bearer ${token}`,
          },
          query: {
            team,
          },
        })

        assert.equal(response.statusCode, 200, 'Should allow HEAD request')
      },
    )
  })

  await test('JWT configuration validation', async (t) => {
    await t.test('should validate JWT issuer configuration', async () => {
      const { createApp } = await import('../src/app.js')
      const app = createApp({
        logger: false,
        configOverrides: {
          JWT_ISSUER: 'test-issuer',
        },
      })
      await app.ready()

      const token = jwksMock.token({ iss: 'test-issuer' })
      const response = await app.inject({
        method: 'GET',
        url: '/v8/artifacts/test-id',
        headers: {
          authorization: `Bearer ${token}`,
        },
        query: {
          team: 'test-team',
        },
      })

      // Should not be 401 (unauthorized) - token should be valid with matching issuer
      assert.notEqual(
        response.statusCode,
        401,
        'Token should be valid with matching issuer',
      )
    })

    await t.test('should validate JWT audience configuration', async () => {
      const { createApp } = await import('../src/app.js')
      const app = createApp({
        logger: false,
        configOverrides: {
          JWT_AUDIENCE: 'test-audience',
        },
      })
      await app.ready()

      const token = jwksMock.token({ aud: 'test-audience' })
      const response = await app.inject({
        method: 'GET',
        url: '/v8/artifacts/test-id',
        headers: {
          authorization: `Bearer ${token}`,
        },
        query: {
          team: 'test-team',
        },
      })

      // Should not be 401 (unauthorized) - token should be valid with matching audience
      assert.notEqual(
        response.statusCode,
        401,
        'Token should be valid with matching audience',
      )
    })
  })

  await test('JWT type safety and module augmentation compatibility', async (t) => {
    await t.test(
      'should handle JWT payload with scope property correctly',
      async () => {
        const { createApp } = await import('../src/app.js')
        const app = createApp({ logger: false })
        await app.ready()

        // Test that JWT payload with scope property is handled correctly
        // This would fail in @fastify/jwt 10.0.0 due to type safety changes
        const token = jwksMock.token({
          scope: 'artifacts:read artifacts:write',
          sub: 'test-user',
          // Removed iss claim since JWT_ISSUER is not configured in this test
        })

        const response = await app.inject({
          method: 'GET',
          url: '/v8/artifacts/test-id',
          headers: {
            authorization: `Bearer ${token}`,
          },
          query: {
            team: 'test-team',
          },
        })

        // Should not be 401 (unauthorized) - token should be valid
        assert.notEqual(
          response.statusCode,
          401,
          'Token with scope should be valid',
        )
      },
    )

    await t.test(
      'should handle JWT payload without scope property',
      async () => {
        const { createApp } = await import('../src/app.js')
        const app = createApp({ logger: false })
        await app.ready()

        // Test that JWT payload without scope property is handled correctly
        // This would fail in @fastify/jwt 10.0.0 due to type safety changes
        const token = jwksMock.token({
          sub: 'test-user',
          // No scope property, no iss claim since JWT_ISSUER is not configured
        })

        const response = await app.inject({
          method: 'GET',
          url: '/v8/artifacts/test-id',
          headers: {
            authorization: `Bearer ${token}`,
          },
          query: {
            team: 'test-team',
          },
        })

        // Should not be 401 (unauthorized) - token should be valid even without scope
        assert.notEqual(
          response.statusCode,
          401,
          'Token without scope should be valid',
        )
      },
    )

    await t.test(
      'should handle JWT user object with scope property',
      async () => {
        const { createApp } = await import('../src/app.js')
        const app = createApp({
          logger: false,
          configOverrides: {
            JWT_READ_SCOPES: 'artifacts:read',
            JWT_WRITE_SCOPES: 'artifacts:write',
          },
        })
        await app.ready()

        // Test that JWT user object with scope property is accessible
        // This would fail in @fastify/jwt 10.0.0 due to type safety changes
        const token = jwksMock.token({ scope: 'artifacts:read' })

        const response = await app.inject({
          method: 'GET',
          url: '/v8/artifacts/test-id',
          headers: {
            authorization: `Bearer ${token}`,
          },
          query: {
            team: 'test-team',
          },
        })

        // Should not be 403 (forbidden) - user.scope should be accessible
        assert.notEqual(
          response.statusCode,
          403,
          'User scope should be accessible',
        )
      },
    )

    await t.test(
      'should handle JWT user object without scope property',
      async () => {
        const { createApp } = await import('../src/app.js')
        const app = createApp({
          logger: false,
          configOverrides: {
            JWT_READ_SCOPES: 'artifacts:read',
            JWT_WRITE_SCOPES: 'artifacts:write',
          },
        })
        await app.ready()

        // Test that JWT user object without scope property is handled gracefully
        // This would fail in @fastify/jwt 10.0.0 due to type safety changes
        const token = jwksMock.token({
          sub: 'test-user',
          // No scope property
        })

        const response = await app.inject({
          method: 'GET',
          url: '/v8/artifacts/test-id',
          headers: {
            authorization: `Bearer ${token}`,
          },
          query: {
            team: 'test-team',
          },
        })

        // Should be 403 (forbidden) - user without scope should be denied
        assert.equal(
          response.statusCode,
          403,
          'User without scope should be denied',
        )
      },
    )

    await t.test(
      'should handle JWT formatUser function with scope property',
      async () => {
        const { createApp } = await import('../src/app.js')
        const app = createApp({ logger: false })
        await app.ready()

        // Test that formatUser function can access scope property from payload
        // This would fail in @fastify/jwt 10.0.0 due to type safety changes
        const token = jwksMock.token({
          scope: 'artifacts:read artifacts:write',
          sub: 'test-user',
        })

        const response = await app.inject({
          method: 'GET',
          url: '/v8/artifacts/test-id',
          headers: {
            authorization: `Bearer ${token}`,
          },
          query: {
            team: 'test-team',
          },
        })

        // Should not be 401 (unauthorized) - formatUser should handle scope correctly
        assert.notEqual(
          response.statusCode,
          401,
          'formatUser should handle scope correctly',
        )
      },
    )

    await t.test(
      'should handle JWT formatUser function without scope property',
      async () => {
        const { createApp } = await import('../src/app.js')
        const app = createApp({ logger: false })
        await app.ready()

        // Test that formatUser function handles payload without scope property
        // This would fail in @fastify/jwt 10.0.0 due to type safety changes
        const token = jwksMock.token({
          sub: 'test-user',
          // No scope property
        })

        const response = await app.inject({
          method: 'GET',
          url: '/v8/artifacts/test-id',
          headers: {
            authorization: `Bearer ${token}`,
          },
          query: {
            team: 'test-team',
          },
        })

        // Should not be 401 (unauthorized) - formatUser should handle missing scope gracefully
        assert.notEqual(
          response.statusCode,
          401,
          'formatUser should handle missing scope gracefully',
        )
      },
    )
  })
})
