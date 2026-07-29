// Shared allowlist for every cached forge-API proxy (search-proxy, graph-proxy).
// Both proxies forward a caller-supplied `url` to `$fetch` server-side, so the
// target must only ever be an exact, known forge API base — never an
// arbitrary caller-controlled host (SSRF). `startsWith` against a full
// "scheme://host/" prefix (not just the host) is safe against lookalike-host
// tricks like `https://api.github.com.evil.com/...`, which doesn't share
// that prefix.
const FORGE_API_BASES = [
  'https://api.github.com/',
  'https://gitlab.com/api/v4/',
  'https://codeberg.org/api/v1/',
  'https://gitea.com/api/v1/'
]

export function isAllowedForgeApiUrl(url: string): boolean {
  return FORGE_API_BASES.some((base) => url.startsWith(base))
}
