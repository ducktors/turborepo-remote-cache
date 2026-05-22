## Summary

Adds a maintenance endpoint to remove stale cache artifacts for a team slug when the server uses local filesystem storage. Operators can trigger cleanup without shell access to the cache directory.

## Motivation

With the default local provider, artifacts live under the configured cache root (by default `/tmp/turborepocache/<slug>`). There was no in-app way to prune old entries for one team. This endpoint supports scheduled or manual cleanup for self-hosted local deployments.

## API

| | |
|---|---|
| **Method** | `POST` |
| **Path** | `/v8/clean` (same API version prefix as existing remote-cache routes) |
| **Auth** | `write` (same as artifact uploads) |

**Query parameters**

| Parameter | Required | Default | Description |
|---|---|---|---|
| `slug` | yes | — | Team slug / cache namespace |
| `olderThan` | no | `10` | Retention window in whole days |

**Response**

```json
{
  "deleted": 0,
  "scanned": 0
}
```

### Example

```http
POST /v8/clean?slug=my-team&olderThan=10
Authorization: Bearer <token>
```

## Behavior

- Resolves the team directory from `STORAGE_PATH` and `STORAGE_PATH_USE_TMP_FOLDER` (same rules as local artifact storage).
- Scans files in that slug directory and deletes regular files whose last access time is at or before the cutoff.
- Returns `{ "deleted": 0, "scanned": 0 }` when the team folder does not exist.
- Returns `400` when `slug` is missing or fails validation (path traversal patterns such as `..`, `/`, or `\`).
- Returns `501` when `STORAGE_PROVIDER` is not `local`.

## Scope and limitations

- **Local storage only.** S3, MinIO, GCS, and Azure Blob are unchanged; use provider lifecycle rules for those backends.
- **Access time.** Retention uses filesystem access time (`atime`). Mount options or OS behavior can affect what counts as “accessed.”
- **Files only.** Only regular files in the slug directory are considered; subdirectories are skipped.

## Testing

`test/clean.ts` covers validation, auth, default and custom retention, missing team folders, and the non-local `501` response.
