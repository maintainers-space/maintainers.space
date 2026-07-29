// Shared transport for a forge's public search endpoints. Authenticated reads
// go straight to the forge (per-user, already above the anonymous rate limit,
// not shareable across viewers so not worth caching). Anonymous reads are
// identical for every viewer, so they're routed through koinon's own cached
// proxy (`server/api/search-proxy.get.ts`) instead of hitting the forge's
// (often strict) unauthenticated rate limit on every keystroke.

export interface SearchFetchOptions {
  token?: string
  headers?: Record<string, string>
  /** Accept header to use for both the direct and proxied request (e.g. GitHub's text-match variant). */
  accept?: string
  /** Bypass the proxy's cache (used once after a full page reload). */
  noCache?: boolean
  signal?: AbortSignal
}

export async function searchFetch<T>(
  url: string,
  query: Record<string, unknown>,
  opts: SearchFetchOptions = {}
): Promise<T> {
  if (opts.token) {
    return (await $fetch(url, {
      headers: { ...opts.headers, ...(opts.accept ? { Accept: opts.accept } : {}) },
      query,
      signal: opts.signal
    })) as T
  }
  return (await $fetch('/api/search-proxy', {
    query: { ...query, url, accept: opts.accept },
    headers: opts.noCache ? { 'Cache-Control': 'no-cache' } : undefined,
    signal: opts.signal
  })) as T
}
