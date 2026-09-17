---
layout: default
title: Environment variables
nav_order: 2
---

# Environment variables

| Variable | Type | Required | Default | Description |
| -- | -- | -- | -- | -- |
| `NODE_ENV` | string | optional | `production` | Possible values are `development` or `production`|
| `PORT` | number | optional | `3000` |   |
| `HOST` | string | optional | `0.0.0.0` | The host address to bind the server to. Use `0.0.0.0` to listen on all IPv4 interfaces or `::` to listen on all interfaces (IPv4 and IPv6). |
| `TURBO_TOKEN` | string | optional |  | Secret token used for the authentication. Required if `AUTH_MODE` is undefined or `static`. You can specify multiple tokens separated by comma (e.g. `TURBO_TOKEN=token1,token2,token3`). The value must be the same one provided for the `token` parameter of the `build` script. See enable [custom remote caching](https://ducktors.github.io/turborepo-remote-cache/custom-remote-caching) in a Turborepo monorepo |
| `AUTH_MODE` | string | optional | `static` | Which authentication mode to use, possible values are `static`, `jwt` or `none` |
| `JWKS_URL` | string | optional | | JWKS metadata url for retrieving public keys for verifying JWTs|
| `JWT_ISSUER` | string | optional | | JWT Issuer, optional even if using JWT authentication, to match `iss` field in JWT.
| `JWT_AUDIENCE` | string | optional | | JWT Audience, optional even if using JWT authentication, to match `aud` field in JWT.
| `JWT_SCOPE_CLAIM` | string | optional | `scope` | The name of the JWT claim that lists the scopes of a token. The claim value can be a string with scopes separated by spaces, or an array of strings. If the value is empty, the server uses `scope`. |
| `JWT_READ_SCOPES` | string | optional | | If specified, one of the scopes listed here must be present in order to read from the cache. You can specify multiple options with a comma-delimited string of scopes.
| `JWT_WRITE_SCOPES` | string | optional | | If specified, one of the scopes listed here must be present in order to write to the cache. You can specify multiple options with a comma-delimited string of scopes.
| `JWT_ROLES_CLAIM` | string | optional | `roles` | The name of the JWT claim that lists the roles of a token. The claim value can be a string with roles separated by spaces, or an array of strings. If the value is empty, the server uses `roles`. |
| `JWT_READ_ROLES` | string | optional | | If specified, one of the roles listed here must be present in order to read from the cache. You can specify multiple options with a comma-delimited string of roles. If you also set `JWT_READ_SCOPES`, the token must have one of the read scopes and one of the read roles. |
| `JWT_WRITE_ROLES` | string | optional | | If specified, one of the roles listed here must be present in order to write to the cache. You can specify multiple options with a comma-delimited string of roles. If you also set `JWT_WRITE_SCOPES`, the token must have one of the write scopes and one of the write roles. |
| `JWT_TEAM_CLAIM` | string | optional | | The name of the JWT claim that lists the teams that a token can use. It has an effect only with `AUTH_MODE=jwt`. If set, the server rejects with `403 Forbidden` a request for a team that is not in the claim. If not set or empty, each valid token can read and write the cache of all teams. See [Team isolation](#team-isolation). |
| `LOG_LEVEL` | string | optional | `'info'` | Possibile values are [one of these](https://github.com/ducktors/turborepo-remote-cache/blob/main/src/logger.ts#L3) |
| `ENABLE_STATUS_LOG` | boolean | optional | `'true'` | Enable/Disable logging for the status endpoint |
| `LOG_MODE` | string | optional | `stdout` | Setting it to 'file' enables writing logs to file |
| `LOG_FILE` | string | optional | `server.log` | Path and file name where save .log file (e.g. /path/to/my/file.log) |
| `STORAGE_PROVIDER` | string | optional | `local` | Possible values are `local`, `s3`, `google-cloud-storage` or `azure-blob-storage`. Use this var to choose the storage provider. |
| `STORAGE_PATH` | string | optional |  | Caching folder under `/tmp` if `STORAGE_PROVIDER` is set to `local`. If `STORAGE_PROVIDER` is set to `s3`, `google-cloud-storage` or `azure-blob-storage`, this will be the name of the bucket. |
| `STORAGE_PATH_USE_TMP_FOLDER` | boolean | optional | `true` | Uses the system tmp folder as a prefix to `STORAGE_PATH` |
| `BODY_LIMIT` | number | optional | `104857600` | The limit for artifact upload size  |
| `HTTP2` | boolean | optional | `'false'` | If set to `true`, the server will use the HTTP/2 protocol, which helps bypass the 32MB payload size limit in Cloud Run |
| `SSL_KEY_PATH` | string | optional | `` | If set, enables HTTPS using the key file at the specified path. |
| `SSL_CERT_PATH` | string | optional | `` | If set, enables HTTPS using the certificate file at the specified path. |
| `TURBO_REMOTE_CACHE_SIGNATURE_KEY` | string | optional | | A secret key used to sign and verify remote cache artifacts. Must be the same for the Turborepo client and the cache server. See [Artifact Integrity and Authenticity Verification](https://ducktors.github.io/turborepo-remote-cache/custom-remote-caching#artifact-integrity-and-authenticity-verification) for more info. |
| `READ_ONLY` | boolean | optional | `false` | If set to `true`, the server runs in read-only mode: cache reads (`GET`/`HEAD /artifacts/:id`) and event acknowledgements (`POST /artifacts/events`) continue to work, while mutating requests (`PUT /artifacts/:id` and `POST /clean`) are rejected with a `403 Forbidden`. Useful for sharing a CI-populated cache with local developers without allowing them to modify entries. |
| `TURBO_CACHE_READ_URL` | string | optional | | If set, cache reads (`GET`/`HEAD /artifacts/:id`) are answered with a `302` redirect to `<TURBO_CACHE_READ_URL>/<teamId>/<artifactId>` instead of being streamed from the storage provider. Writes are unaffected and still go to the configured `STORAGE_PROVIDER`. Use it to serve reads from a CDN or proxy (CloudFront, Cloudflare, ...) to cut egress cost and latency. Must include the scheme (`http://` or `https://`); the server fails to start otherwise. See [Serving cache reads from a CDN](#serving-cache-reads-from-a-cdn). |

Both `SSL_KEY_PATH` and `SSL_CERT_PATH` must be set to enable HTTPS.

## Team isolation

The server stores the artifacts of each team under a different path. The
Turborepo client sends the team in the query string as `teamId`, `team`, or
`slug`. The authentication mode sets which teams a client can use:

- With `AUTH_MODE=none`, the server does not check tokens. Each client can read
  and write the cache of all teams.
- With `AUTH_MODE=static`, all tokens in `TURBO_TOKEN` share one trust domain.
  Each token can read and write the cache of all teams.
- With `AUTH_MODE=jwt` and no `JWT_TEAM_CLAIM`, each valid token can read and
  write the cache of all teams. The server writes a warning to the log at
  startup. An empty `JWT_TEAM_CLAIM` has the same effect as no value.
- With `AUTH_MODE=jwt` and `JWT_TEAM_CLAIM`, the server reads the list of
  allowed teams from that claim.

`JWT_TEAM_CLAIM` has no effect with `AUTH_MODE=static` or `AUTH_MODE=none`.

The team claim value can have one of these types:

- An array of strings. The server ignores array items that are not strings.
- A string with team names separated by spaces. The server splits the string
  on spaces. Use a claim that only the identity provider sets. Do not use a
  free-form value, for example a display name.

If the claim has a different type, the token has no allowed teams.

When `JWT_TEAM_CLAIM` is set, the server rejects these requests with
`403 Forbidden`:

- A request for a team that is not in the claim.
- A request with a team and a token that does not have the claim.

The team check applies to each cache route that requires a token, when the
query string has a team. This includes `POST /artifacts/events`. The Turborepo
client sends the team on this route, so the token must list that team. A
request without a team does not use team data, so the server does not do the
team check. An example is `POST /artifacts/events` without a query string.

```sh
AUTH_MODE=jwt
JWKS_URL=https://auth.example.com/.well-known/jwks.json
JWT_TEAM_CLAIM=teams
```

Example token payload:

```json
{
  "iss": "https://auth.example.com/",
  "sub": "ci-runner",
  "scope": "artifacts:read artifacts:write",
  "teams": ["team-a", "team-b"]
}
```

With the configuration above, this token can use the cache of `team-a` and
`team-b`. A request with `teamId=team-c` gets `403 Forbidden`.

Notes:

- The server uses the claim name as a top-level key of the token payload. It
  does not read nested properties. A namespaced claim name, for example
  `https://example.com/teams`, is also a top-level key.
- The team check does not replace the scope and role checks. If you set
  `JWT_READ_SCOPES`, `JWT_WRITE_SCOPES`, `JWT_READ_ROLES` or `JWT_WRITE_ROLES`,
  the token must also have a required scope or role.
- You cannot use a team name that contains `/`. For example, the GitHub OIDC
  `repository` claim has values such as `octo-org/octo-repo`. The server
  rejects a request for this team with `400 Bad Request`.
- To isolate teams with `AUTH_MODE=static`, run a different server with a
  different `STORAGE_PATH` for each trust domain.
- With `TURBO_CACHE_READ_URL`, the client reads artifacts from the CDN, and the
  CDN does not do the team check. A token in the base URL goes to each client
  in the redirect, so a client can use it to read the artifacts of all teams.
  To isolate reads between teams, make the CDN control access for each team, or
  do not set `TURBO_CACHE_READ_URL`.
- In all authentication modes, the server rejects with `400 Bad Request` a
  team or an artifact id that is empty, is `.`, or contains `..`, `/`, `\`, or
  a NUL character. When `JWT_TEAM_CLAIM` is set, the team check runs first. A
  request for a team that is not in the claim gets `403 Forbidden` before this
  check.
- With `STORAGE_PROVIDER=local` on a case-insensitive file system, for example
  on macOS or Windows, team names that differ only in letter case use the same
  folder. On some file systems, for example on macOS, team names that differ
  only in Unicode normalization also use the same folder. Make sure that the
  identity provider gives team names that are unique after case folding and
  Unicode normalization. S3, Google Cloud Storage, and Azure Blob Storage keys
  are case-sensitive.

## Serving cache reads from a CDN

Setting `TURBO_CACHE_READ_URL` splits cache reads from cache writes:

- `PUT /artifacts/:id` keeps writing to the configured `STORAGE_PROVIDER`.
- `GET`/`HEAD /artifacts/:id` return `302 Found` with a `Location` of
  `<TURBO_CACHE_READ_URL>/<teamId>/<artifactId>`, and the Turborepo client
  follows the redirect to fetch the artifact from the CDN.

```sh
STORAGE_PROVIDER=s3
STORAGE_PATH=my-turbo-cache-bucket
TURBO_CACHE_READ_URL=https://cdn.example.com
```

With the configuration above, a request for artifact `abc123` on team `myteam`
is redirected to `https://cdn.example.com/myteam/abc123`.

Notes:

- The CDN must be backed by the same bucket/container as `STORAGE_PATH`, and
  must expose artifacts under the `<teamId>/<artifactId>` path layout.
- A path or query string on the base URL is preserved, so
  `https://cdn.example.com/cache?token=secret` redirects to
  `https://cdn.example.com/cache/myteam/abc123?token=secret`.
- Team and artifact identifiers are URL-encoded when building the redirect.
- When `TURBO_REMOTE_CACHE_SIGNATURE_KEY` is set, the `x-artifact-tag` header is
  still resolved from the storage provider before the redirect is issued, so
  signature verification keeps working.
- Because reads are redirected before the storage provider is consulted, the
  server cannot tell a hit from a miss: a request for an artifact that does not
  exist is still redirected and the CDN answers `404`. The exception is
  `TURBO_REMOTE_CACHE_SIGNATURE_KEY`: the tag lookup runs first, so a missing
  tag returns `404` from the server.
- The redirect target is not protected by the server's authentication. Restrict
  access at the CDN - for example with a signed URL, a token in the base URL
  query string, or an origin rule.

