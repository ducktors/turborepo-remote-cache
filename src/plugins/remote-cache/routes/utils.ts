/**
 * 为给定的基础 URL、团队 ID 和缓存 ID 构建 CDN 重定向 URL。
 * 对各路径段进行编码以防止路径遍历攻击。
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
