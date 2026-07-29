// Allowlist for the anonymous-search cache proxy (server/api/search-proxy.get.ts).
// The proxy forwards a caller-supplied `url` to `$fetch` server-side, so it must
// only ever accept exact, known forge search API bases — never an arbitrary
// caller-controlled host (SSRF). `startsWith` against a full "scheme://host/"
// prefix (not just the host) is safe against lookalike-host tricks like
// `https://api.github.com.evil.com/...`, which doesn't share that prefix.
const SEARCH_API_BASES = [
  'https://api.github.com/',
  'https://gitlab.com/api/v4/',
  'https://codeberg.org/api/v1/',
  'https://gitea.com/api/v1/'
]

export function isAllowedSearchUrl(url: string): boolean {
  return SEARCH_API_BASES.some((base) => url.startsWith(base))
}
