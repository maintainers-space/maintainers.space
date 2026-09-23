// Deployment previews can't register their own OAuth callback URL, so they start
// the flow on production and ask to be sent back afterwards. The callback puts
// the access token in the redirect fragment, so only operator-configured
// origins may ever receive it — anything else would leak the token.

/**
 * Parse a comma-separated allowlist of exact `https://` origins, optionally with
 * a leading `*.` wildcard for one or more subdomain labels
 * (e.g. `https://*.maintainers-space.pages.dev`).
 */
function parseAllowlist(allowlist: string): string[] {
  return allowlist
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function matches(origin: URL, pattern: string): boolean {
  const wildcard = pattern.match(/^https:\/\/\*\.(.+)$/)
  if (!wildcard) return origin.origin === pattern
  return !origin.port && origin.hostname.endsWith(`.${wildcard[1]}`)
}

/** The preview origin to return to after OAuth, or `undefined` when it isn't allowlisted. */
export function allowedPreviewOrigin(raw: unknown, allowlist: string): string | undefined {
  if (typeof raw !== 'string') return undefined
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return undefined
  }
  // A bare https origin only: no credentials, path, query or fragment smuggled along.
  if (url.protocol !== 'https:' || url.origin !== raw) return undefined
  return parseAllowlist(allowlist).some((pattern) => matches(url, pattern)) ? url.origin : undefined
}
