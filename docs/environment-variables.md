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
| `TURBO_TOKEN` | string | mandatory |  | Secret token used for the authentication. You can specify multiple tokens separated by comma (e.g. `TURBO_TOKEN=token1,token2,token3`). The value must be the same one provided for the `token` parameter of the `build` script. See enable [custom remote caching](https://ducktors.github.io/turborepo-remote-cache/custom-remote-caching) in a Turborepo monorepo |
| `LOG_LEVEL` | string | optional | Possibile values are [one of these](https://github.com/ducktors/turborepo-remote-cache/blob/main/src/logger.ts#L3)  | `'info'` |
| `LOG_MODE` | string | optional | Setting it to 'file' enables writing logs to file | `stdout` |
| `LOG_FILE` | string | optional | Path and file name where save .log file (e.g. /path/to/my/file.log) | `server.log` |
| `STORAGE_PROVIDER` | string | optional | Possible values are `local`, `s3`, `google-cloud-storage` or `azure-blob-storage`. Use this var to choose the storage provider. | `local`  |
| `STORAGE_PATH` | string | optional |  | Caching folder under `/tmp` if `STORAGE_PROVIDER` is set to `local`. If `STORAGE_PROVIDER` is set to `s3`, `google-cloud-storage` or `azure-blob-storage`, this will be the name of the bucket. |
| `STORAGE_PATH_USE_TMP_FOLDER` | boolean | optional | `true` | Uses the system tmp folder as a prefix to `STORAGE_PATH` |
| `BODY_LIMIT` | number | optional | `104857600` | The limit for artifact upload size  |
