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
| `TURBO_TOKEN` | string | optional |  | Secret token used for the authentication. Required if `AUTH_MODE` is undefined or `static`. You can specify multiple tokens separated by comma (e.g. `TURBO_TOKEN=token1,token2,token3`). The value must be the same one provided for the `token` parameter of the `build` script. See enable [custom remote caching](https://ducktors.github.io/turborepo-remote-cache/custom-remote-caching) in a Turborepo monorepo |
| `AUTH_MODE` | string | optional | `static` | Which authentication mode to use, possible values are `static` or `jwt`|
| `JWKS_URL` | string | optional | | JWKS metadata url for retrieving public keys for verifying JWTs|
| `JWT_ISSUER` | string | optional | | JWT Issuer, optional even if using JWT authentication, to match `iss` field in JWT.
| `JWT_AUDIENCE` | string | optional | | JWT Audience, optional even if using JWT authentication, to match `aud` field in JWT.
| `JWT_READ_SCOPES` | string | optional | | If specified, one of the scopes listed here must be present in order to read from the cache. You can specify multiple options with a comma-delimited string of scopes.
| `JWT_WRITE_SCOPES` | string | optional | | If specified, one of the scopes listed here must be present in order to write to the cache. You can specify multiple options with a comma-delimited string of scopes.
| `LOG_LEVEL` | string | optional | `'info'` | Possibile values are [one of these](https://github.com/ducktors/turborepo-remote-cache/blob/main/src/logger.ts#L3) |
| `LOG_MODE` | string | optional | `stdout` | Setting it to 'file' enables writing logs to file |
| `LOG_FILE` | string | optional | `server.log` | Path and file name where save .log file (e.g. /path/to/my/file.log) |
| `STORAGE_PROVIDER` | string | optional | `local` | Possible values are `local`, `s3`, `google-cloud-storage` or `azure-blob-storage`. Use this var to choose the storage provider. |
| `STORAGE_PATH` | string | optional |  | Caching folder under `/tmp` if `STORAGE_PROVIDER` is set to `local`. If `STORAGE_PROVIDER` is set to `s3`, `google-cloud-storage` or `azure-blob-storage`, this will be the name of the bucket. |
| `STORAGE_PATH_USE_TMP_FOLDER` | boolean | optional | `true` | Uses the system tmp folder as a prefix to `STORAGE_PATH` |
| `BODY_LIMIT` | number | optional | `104857600` | The limit for artifact upload size  |
