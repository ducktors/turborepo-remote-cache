import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import type { FastifyInstance } from 'fastify'
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

// Sends a GET or PUT request for an artifact with a bearer token.
function requestArtifact(
  app: FastifyInstance,
  method: 'GET' | 'PUT',
  token: string,
  artifactId: string,
  team: string,
) {
  return app.inject({
    method,
    url: `/v8/artifacts/${artifactId}`,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/octet-stream',
    },
    query: {
      team,
    },
    payload: method === 'PUT' ? Buffer.from('test cache data') : undefined,
  })
}

describe('JWT auth', async () => {
  await test('without authorization scopes configured', async (t) => {
    const { createApp } = await import('../src/app.js')
    const app = createApp({ logger: false })
    await app.ready()
    await t.test('Fails for static/malformed token', async () => {
      const resp = await app.inject({
        method: 'GET',
        url: '/v8/artifacts/123',
        headers: {
          authorization: 'Bearer changeme',
        },
        query: {
          team: 'asd',
        },
      })
      assert.equal(resp.statusCode, 401)
      // Should not be the default generic Boom "Unauthorized" — must carry
      // a useful reason from fastify-jwt-jwks (e.g. "Invalid token.").
      const message = resp.json().message
      assert.notEqual(message, 'Unauthorized')
      assert.ok(
        typeof message === 'string' && message.length > 0,
        `expected non-empty message, got: ${JSON.stringify(message)}`,
      )
    })
    await t.test('Fails for invalid token', async () => {
      const token = invalidJwksMock.token()
      const resp = await app.inject({
        method: 'GET',
        url: '/v8/artifacts/123',
        headers: {
          authorization: `Bearer ${token}`,
        },
        query: {
          team: 'asd',
        },
      })
      assert.equal(resp.statusCode, 401)
      const message = resp.json().message
      assert.notEqual(message, 'Unauthorized')
      assert.ok(
        typeof message === 'string' && message.length > 0,
        `expected non-empty message, got: ${JSON.stringify(message)}`,
      )
    })
    await t.test('Fails for expired token', async () => {
      // exp = 1 → unix-epoch + 1 second, very firmly in the past.
      const expiredToken = jwksMock.token({ exp: 1 })
      const resp = await app.inject({
        method: 'GET',
        url: '/v8/artifacts/123',
        headers: {
          authorization: `Bearer ${expiredToken}`,
        },
        query: {
          team: 'asd',
        },
      })
      assert.equal(resp.statusCode, 401)
      // fastify-jwt-jwks maps the underlying "token expired" jsonwebtoken
      // error to the message "Expired token." — assert case-insensitively
      // to stay resilient to upstream wording tweaks.
      assert.match(resp.json().message, /expired/i)
    })
    await t.test('Valid token', async (t1) => {
      const artifactId = randomUUID()
      const team = randomUUID()
      const token = jwksMock.token()
      await t1.test('creates cache entry', async () => {
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
        assert.equal(response.statusCode, 200)
      })

      await t1.test('fetches artifact', async () => {
        const resp = await app.inject({
          method: 'GET',
          url: `/v8/artifacts/${artifactId}`,
          headers: {
            authorization: `Bearer ${token}`,
          },
          query: {
            team,
          },
        })
        assert.equal(resp.statusCode, 200)
      })
    })
  })
  await test('with authorization scopes defined', async (t) => {
    const { createApp } = await import('../src/app.js')
    const app = createApp({
      logger: false,
      configOverrides: {
        JWT_READ_SCOPES: 'artifacts:read,artifacts:write',
        JWT_WRITE_SCOPES: 'artifacts:write',
      },
    })
    await app.ready()
    const artifactId = randomUUID()
    const team = randomUUID()
    const token = jwksMock.token({ scope: 'artifacts:write' })

    await t.test('creates cache entry', async () => {
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
      assert.equal(response.statusCode, 200)
    })

    await t.test('fetches artifact', async () => {
      const resp = await app.inject({
        method: 'GET',
        url: `/v8/artifacts/${artifactId}`,
        headers: {
          authorization: `Bearer ${token}`,
        },
        query: {
          team,
        },
      })
      assert.equal(resp.statusCode, 200)
    })

    await t.test('forbidden with token without scope', async () => {
      const token = jwksMock.token()
      const resp = await app.inject({
        method: 'GET',
        url: `/v8/artifacts/${artifactId}`,
        headers: {
          authorization: `Bearer ${token}`,
        },
        query: {
          team,
        },
      })
      assert.equal(resp.statusCode, 403)
    })
  })

  await test('with authorization roles defined', async (t) => {
    const { createApp } = await import('../src/app.js')
    const app = createApp({
      logger: false,
      configOverrides: {
        JWT_READ_ROLES: 'Artifacts.Reader',
        JWT_WRITE_ROLES: 'Artifacts.Writer',
      },
    })
    await app.ready()
    t.after(() => app.close())
    const artifactId = randomUUID()
    const team = randomUUID()
    const token = jwksMock.token({
      roles: ['Artifacts.Reader', 'Artifacts.Writer'],
    })

    await t.test('creates cache entry', async () => {
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
      assert.equal(response.statusCode, 200)
    })

    await t.test('fetches artifact', async () => {
      const resp = await app.inject({
        method: 'GET',
        url: `/v8/artifacts/${artifactId}`,
        headers: {
          authorization: `Bearer ${token}`,
        },
        query: {
          team,
        },
      })
      assert.equal(resp.statusCode, 200)
    })

    await t.test('forbidden with token without required roles', async () => {
      const token = jwksMock.token({ roles: ['InvalidRole'] })
      const resp = await app.inject({
        method: 'GET',
        url: `/v8/artifacts/${artifactId}`,
        headers: {
          authorization: `Bearer ${token}`,
        },
        query: {
          team,
        },
      })
      assert.equal(resp.statusCode, 403)
    })

    await t.test(
      'forbidden with token without required roles claim',
      async () => {
        const token = jwksMock.token({})
        const resp = await app.inject({
          method: 'GET',
          url: `/v8/artifacts/${artifactId}`,
          headers: {
            authorization: `Bearer ${token}`,
          },
          query: {
            team,
          },
        })
        assert.equal(resp.statusCode, 403)
      },
    )

    await t.test(
      'rejects PUT from a token with the read role only',
      async () => {
        const token = jwksMock.token({ roles: ['Artifacts.Reader'] })
        const otherArtifactId = randomUUID()
        const created = await requestArtifact(
          app,
          'PUT',
          token,
          otherArtifactId,
          team,
        )
        assert.equal(created.statusCode, 403)
        // The token can read, and the rejected PUT did not write the artifact.
        const response = await requestArtifact(
          app,
          'GET',
          token,
          otherArtifactId,
          team,
        )
        assert.equal(response.statusCode, 404)
      },
    )

    await t.test('reads a roles claim that is a string', async () => {
      // The roles in the string are separated by spaces.
      const token = jwksMock.token({
        roles: 'Artifacts.Reader Artifacts.Writer',
      })
      const otherArtifactId = randomUUID()
      for (const method of ['PUT', 'GET'] as const) {
        const response = await requestArtifact(
          app,
          method,
          token,
          otherArtifactId,
          team,
        )
        assert.equal(response.statusCode, 200, method)
      }
    })

    await t.test(
      'ignores items of a roles claim that are not strings',
      async () => {
        const token = jwksMock.token({ roles: [42, 'Artifacts.Reader'] })
        const response = await requestArtifact(
          app,
          'GET',
          token,
          artifactId,
          team,
        )
        assert.equal(response.statusCode, 200)
      },
    )
  })

  await test('ignores empty items in the required scopes and roles', async (t) => {
    const { createApp } = await import('../src/app.js')
    const app = createApp({
      logger: false,
      configOverrides: {
        JWT_READ_SCOPES: 'artifacts:read,',
        JWT_READ_ROLES: 'Artifacts.Reader,',
      },
    })
    await app.ready()
    t.after(() => app.close())

    await t.test(
      'rejects a token with an empty scope and an empty role',
      async () => {
        const token = jwksMock.token({ scope: [''], roles: [''] })
        const response = await requestArtifact(
          app,
          'GET',
          token,
          randomUUID(),
          randomUUID(),
        )
        assert.equal(response.statusCode, 403)
      },
    )
  })

  await test('with an alternative scope claim name', async (t) => {
    const { createApp } = await import('../src/app.js')
    const app = createApp({
      logger: false,
      configOverrides: {
        JWT_SCOPE_CLAIM: 'scp',
        JWT_READ_SCOPES: 'artifacts:read,artifacts:write',
        JWT_WRITE_SCOPES: 'artifacts:write',
      },
    })
    await app.ready()
    t.after(() => app.close())
    const team = randomUUID()

    await t.test('supports alternative scope claim name', async () => {
      const artifactId = randomUUID()
      const token = jwksMock.token({ scp: 'artifacts:write' })

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
      assert.equal(response.statusCode, 200)
    })

    await t.test('reads a scope claim that is an array', async () => {
      const token = jwksMock.token({
        scp: ['artifacts:read', 'artifacts:write'],
      })
      const artifactId = randomUUID()
      for (const method of ['PUT', 'GET'] as const) {
        const response = await requestArtifact(
          app,
          method,
          token,
          artifactId,
          team,
        )
        assert.equal(response.statusCode, 200, method)
      }
    })

    await t.test('does not read the default scope claim', async () => {
      const token = jwksMock.token({ scope: 'artifacts:write' })
      const response = await requestArtifact(
        app,
        'PUT',
        token,
        randomUUID(),
        team,
      )
      assert.equal(response.statusCode, 403)
    })
  })

  await test('with an alternative roles claim name', async (t) => {
    const { createApp } = await import('../src/app.js')
    const app = createApp({
      logger: false,
      configOverrides: {
        JWT_ROLES_CLAIM: 'groups',
        JWT_READ_ROLES: 'Artifacts.Reader',
        JWT_WRITE_ROLES: 'Artifacts.Writer',
      },
    })
    await app.ready()
    t.after(() => app.close())

    await t.test('supports alternative roles claim name', async () => {
      const artifactId = randomUUID()
      const team = randomUUID()
      const token = jwksMock.token({
        groups: ['Artifacts.Reader', 'Artifacts.Writer'],
      })

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
      assert.equal(response.statusCode, 200)
    })
  })

  await test('handles empty scope and roles claim names as not set', async (t) => {
    const { createApp } = await import('../src/app.js')
    const app = createApp({
      logger: false,
      configOverrides: {
        JWT_SCOPE_CLAIM: '',
        JWT_ROLES_CLAIM: '',
        JWT_READ_SCOPES: 'artifacts:read',
        JWT_READ_ROLES: 'Artifacts.Reader',
      },
    })
    await app.ready()
    t.after(() => app.close())
    assert.equal(app.config.JWT_SCOPE_CLAIM, '')
    assert.equal(app.config.JWT_ROLES_CLAIM, '')

    // The server reads the default claims "scope" and "roles".
    const token = jwksMock.token({
      scope: 'artifacts:read',
      roles: ['Artifacts.Reader'],
    })
    const response = await requestArtifact(
      app,
      'GET',
      token,
      randomUUID(),
      randomUUID(),
    )
    assert.equal(response.statusCode, 404)
  })

  await test('with authorization scopes and roles defined', async (t) => {
    const { createApp } = await import('../src/app.js')
    const app = createApp({
      logger: false,
      configOverrides: {
        JWT_READ_SCOPES: 'artifacts:read',
        JWT_WRITE_SCOPES: 'artifacts:write',
        JWT_READ_ROLES: 'Artifacts.Reader',
        JWT_WRITE_ROLES: 'Artifacts.Writer',
      },
    })
    await app.ready()
    t.after(() => app.close())
    const team = randomUUID()
    const scope = 'artifacts:read artifacts:write'
    const roles = ['Artifacts.Reader', 'Artifacts.Writer']

    await t.test('allows a token with the scopes and the roles', async () => {
      const token = jwksMock.token({ scope, roles })
      const artifactId = randomUUID()
      for (const method of ['PUT', 'GET'] as const) {
        const response = await requestArtifact(
          app,
          method,
          token,
          artifactId,
          team,
        )
        assert.equal(response.statusCode, 200, method)
      }
    })

    await t.test(
      'rejects a token with only the scopes or only the roles',
      async () => {
        for (const payload of [{ scope }, { roles }]) {
          const token = jwksMock.token(payload)
          for (const method of ['PUT', 'GET'] as const) {
            const response = await requestArtifact(
              app,
              method,
              token,
              randomUUID(),
              team,
            )
            assert.equal(
              response.statusCode,
              403,
              `${method} with ${JSON.stringify(payload)}`,
            )
          }
        }
      },
    )
  })
})

describe('with team claim configured', async () => {
  await test('authorizes the team from the token claim', async (t) => {
    const { createApp } = await import('../src/app.js')
    const app = createApp({
      logger: false,
      configOverrides: {
        JWT_TEAM_CLAIM: 'teams',
      },
    })
    await app.ready()
    t.after(() => app.close())

    const teamAToken = jwksMock.token({ teams: ['team-a'] })
    const teamBToken = jwksMock.token({ teams: ['team-b'] })
    const artifactId = randomUUID()
    const teamKeys = ['team', 'teamId', 'slug']

    function injectArtifact(
      method: 'GET' | 'HEAD' | 'PUT',
      token: string,
      query: Record<string, string>,
      id = artifactId,
    ) {
      if (method === 'PUT') {
        return app.inject({
          method,
          url: `/v8/artifacts/${id}`,
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/octet-stream',
          },
          query,
          payload: Buffer.from('test cache data'),
        })
      }
      return app.inject({
        method,
        url: `/v8/artifacts/${id}`,
        headers: {
          authorization: `Bearer ${token}`,
        },
        query,
      })
    }

    for (const key of teamKeys) {
      await t.test(
        `allows PUT, GET and HEAD on the team with ${key}`,
        async () => {
          for (const method of ['PUT', 'GET', 'HEAD'] as const) {
            const response = await injectArtifact(method, teamAToken, {
              [key]: 'team-a',
            })
            assert.equal(response.statusCode, 200, `${method} with ${key}`)
          }
        },
      )
    }

    for (const key of teamKeys) {
      await t.test(
        `rejects GET, HEAD and PUT on a different team with ${key}`,
        async () => {
          const otherArtifactId = randomUUID()
          for (const method of ['GET', 'HEAD', 'PUT'] as const) {
            const response = await injectArtifact(
              method,
              teamAToken,
              { [key]: 'team-b' },
              otherArtifactId,
            )
            assert.equal(response.statusCode, 403, `${method} with ${key}`)
          }
          // The rejected PUT must not write the artifact.
          const response = await injectArtifact(
            'GET',
            teamBToken,
            { team: 'team-b' },
            otherArtifactId,
          )
          assert.equal(response.statusCode, 404)
        },
      )
    }

    await t.test('uses the same team precedence as the routes', async () => {
      const rejected = await injectArtifact('GET', teamAToken, {
        teamId: 'team-b',
        slug: 'team-a',
      })
      assert.equal(rejected.statusCode, 403)

      const allowed = await injectArtifact('GET', teamAToken, {
        teamId: 'team-a',
        slug: 'team-b',
      })
      assert.equal(allowed.statusCode, 200)
    })

    await t.test('allows each team in a space-separated claim', async () => {
      const token = jwksMock.token({ teams: 'team-a team-c' })
      for (const method of ['PUT', 'GET', 'HEAD'] as const) {
        const response = await injectArtifact(method, token, { team: 'team-c' })
        assert.equal(response.statusCode, 200, method)
      }
      const response = await injectArtifact('GET', token, { team: 'team-b' })
      assert.equal(response.statusCode, 403)
    })

    await t.test('rejects a token without the team claim', async () => {
      const token = jwksMock.token()
      const response = await injectArtifact('GET', token, { team: 'team-a' })
      assert.equal(response.statusCode, 403)
    })

    await t.test(
      'rejects a token with a team claim that is not a string or an array',
      async () => {
        for (const teams of [42, { 'team-a': true }]) {
          const token = jwksMock.token({ teams })
          const response = await injectArtifact('GET', token, {
            team: 'team-a',
          })
          assert.equal(response.statusCode, 403, JSON.stringify(teams))
        }
      },
    )

    await t.test(
      'ignores items of a team claim that are not strings',
      async () => {
        const token = jwksMock.token({ teams: [42, 'team-a'] })
        const response = await injectArtifact('GET', token, { team: 'team-a' })
        assert.equal(response.statusCode, 200)
      },
    )

    await t.test('rejects POST /clean on a different team', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v8/clean',
        headers: {
          authorization: `Bearer ${teamAToken}`,
        },
        query: {
          slug: 'team-b',
        },
      })
      assert.equal(response.statusCode, 403)
    })

    await t.test(
      'rejects POST /clean when teamId is not in the clean route schema',
      async () => {
        // The clean route schema does not declare teamId, so validation
        // removes it and the route handler uses slug.
        const response = await app.inject({
          method: 'POST',
          url: '/v8/clean',
          headers: {
            authorization: `Bearer ${teamAToken}`,
          },
          query: {
            teamId: 'team-a',
            slug: 'team-b',
          },
        })
        assert.equal(response.statusCode, 403)
      },
    )

    await t.test('allows POST /clean on the team', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v8/clean',
        headers: {
          authorization: `Bearer ${teamAToken}`,
        },
        query: {
          slug: 'team-a',
          olderThan: '3650',
        },
      })
      assert.equal(response.statusCode, 200)
    })

    await t.test('allows POST /artifacts/events without a team', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v8/artifacts/events',
        headers: {
          authorization: `Bearer ${teamAToken}`,
          'content-type': 'application/octet-stream',
        },
        payload: Buffer.from('test cache data'),
      })
      assert.equal(response.statusCode, 200)
    })

    await t.test(
      'rejects POST /artifacts/events with a different team',
      async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/v8/artifacts/events',
          headers: {
            authorization: `Bearer ${teamAToken}`,
            'content-type': 'application/octet-stream',
          },
          query: {
            team: 'team-b',
          },
          payload: Buffer.from('test cache data'),
        })
        assert.equal(response.statusCode, 403)
      },
    )

    await t.test(
      'rejects an encoded artifact id that points to a different team',
      async () => {
        const victimArtifactId = randomUUID()
        const created = await injectArtifact(
          'PUT',
          teamBToken,
          { team: 'team-b' },
          victimArtifactId,
        )
        assert.equal(created.statusCode, 200)

        const response = await injectArtifact(
          'GET',
          teamAToken,
          { team: 'team-a' },
          `..%2Fteam-b%2F${victimArtifactId}`,
        )
        assert.equal(response.statusCode, 400)
        assert.equal(response.json().message, 'Invalid id')
      },
    )

    await t.test('rejects a query with more than one team', async () => {
      const duplicateArtifactId = randomUUID()
      const created = await app.inject({
        method: 'PUT',
        url: `/v8/artifacts/${duplicateArtifactId}`,
        headers: {
          authorization: `Bearer ${teamBToken}`,
          'content-type': 'application/octet-stream',
        },
        query: {
          team: 'team-b',
        },
        payload: Buffer.from('team-b cache data'),
      })
      assert.equal(created.statusCode, 200)

      const response = await app.inject({
        method: 'GET',
        url: `/v8/artifacts/${duplicateArtifactId}?team=team-a&team=team-b`,
        headers: {
          authorization: `Bearer ${teamAToken}`,
        },
      })
      assert.notEqual(response.statusCode, 200)
      assert.ok(!response.body.includes('team-b cache data'))
    })
  })

  await test('reads a namespaced team claim', async (t) => {
    const { createApp } = await import('../src/app.js')
    const app = createApp({
      logger: false,
      configOverrides: {
        JWT_TEAM_CLAIM: 'https://example.com/teams',
      },
    })
    await app.ready()
    t.after(() => app.close())

    const token = jwksMock.token({ 'https://example.com/teams': ['team-a'] })
    for (const [team, statusCode] of [
      ['team-a', 404],
      ['team-b', 403],
    ] as const) {
      const response = await app.inject({
        method: 'GET',
        url: `/v8/artifacts/${randomUUID()}`,
        headers: {
          authorization: `Bearer ${token}`,
        },
        query: {
          team,
        },
      })
      assert.equal(response.statusCode, statusCode, team)
    }
  })

  await test('handles an empty team claim name as not set', async (t) => {
    const { createApp } = await import('../src/app.js')
    const app = createApp({
      logger: false,
      configOverrides: {
        JWT_TEAM_CLAIM: '',
      },
    })
    await app.ready()
    t.after(() => app.close())
    assert.equal(app.config.JWT_TEAM_CLAIM, '')

    const token = jwksMock.token()
    for (const team of ['team-a', 'team-b']) {
      const artifactId = randomUUID()
      const created = await app.inject({
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
      assert.equal(created.statusCode, 200, team)

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
      assert.equal(response.statusCode, 200, team)
    }
  })
})
