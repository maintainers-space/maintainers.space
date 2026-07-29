// Shared transport for forge endpoints that are safe to cache when anonymous.
// Authenticated reads go straight to the forge (per-user, already above the
// anonymous rate limit, not shareable across viewers so not worth caching).
// Anonymous reads are identical for every viewer, so they're routed through
// one of maintainers.space's own cached proxies instead of hitting the forge's (often
// strict) unauthenticated rate limit on every request.

export interface CachedFetchOptions {
  token?: string
  headers?: Record<string, string>
  /** Accept header to use for both the direct and proxied request (e.g. GitHub's text-match variant). */
  accept?: string
  /** Bypass the proxy's cache (used once after a full page reload on Search). */
  noCache?: boolean
  /** Which cached proxy route to use for anonymous reads. @default '/api/search-proxy' */
  proxyPath?: '/api/search-proxy' | '/api/graph-proxy'
  signal?: AbortSignal
}

export async function cachedFetch<T>(
  url: string,
  query: Record<string, unknown>,
  opts: CachedFetchOptions = {}
): Promise<T> {
  if (opts.token) {
    return (await $fetch(url, {
      headers: { ...opts.headers, ...(opts.accept ? { Accept: opts.accept } : {}) },
      query,
      signal: opts.signal
    })) as T
  }
  return (await $fetch(opts.proxyPath ?? '/api/search-proxy', {
    query: { ...query, url, accept: opts.accept },
    headers: opts.noCache ? { 'Cache-Control': 'no-cache' } : undefined,
    signal: opts.signal
  })) as T
}
