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
