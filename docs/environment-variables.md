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
| `JWT_READ_SCOPES` | string | optional | | If specified, one of the scopes listed here must be present in order to read from the cache. You can specify multiple options with a comma-delimited string of scopes.
| `JWT_WRITE_SCOPES` | string | optional | | If specified, one of the scopes listed here must be present in order to write to the cache. You can specify multiple options with a comma-delimited string of scopes.
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

