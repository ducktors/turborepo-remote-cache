import { badRequest } from '@hapi/boom'
import type { Querystring } from './schema.js'

/**
 * Builds the CDN redirect URL for a given base URL, team ID, and artifact ID.
 * Encodes path segments to prevent path traversal attacks.
 */
export function buildCdnRedirectUrl(
  base: string,
  team: string,
  artifactId: string,
): string {
  const suffix = `${encodeURIComponent(team)}/${encodeURIComponent(artifactId)}`
  try {
    const parsed = new URL(base)
    parsed.pathname = parsed.pathname.endsWith('/')
      ? `${parsed.pathname}${suffix}`
      : `${parsed.pathname}/${suffix}`
    return parsed.toString()
  } catch {
    const readUrl = base.endsWith('/') ? base : `${base}/`
    return `${readUrl}${suffix}`
  }
}

/**
 * Returns the team from the query string.
 * The route handlers and the JWT team authorization use this function,
 * so they always get the same team.
 */
export function getTeamFromQuery(query: Querystring): string | undefined {
  // The Turborepo client sends the team as slug when you use the --team option.
  return query.teamId ?? query.team ?? query.slug
}

/**
 * Rejects a value that is not a safe path segment. The server joins the team
 * and the artifact id into a storage path. An empty value, `.`, `..`, a path
 * separator, or a NUL character can make that path point to a different file
 * or folder.
 */
export function assertSafePathSegment(value: string, name: string): void {
  if (
    value.length === 0 ||
    value === '.' ||
    value.includes('..') ||
    value.includes('/') ||
    value.includes('\\') ||
    value.includes('\0')
  ) {
    throw badRequest(`Invalid ${name}`)
  }
}
