// Corporate-proxy-resilient fetch for public atproto/Bluesky reads.
//
// Some corporate networks block every Bluesky-operated domain outright, which
// breaks identity resolution and all public reads even though none of them need
// authentication. `proxiedFetch` first tries the request directly (normal
// networks are completely unaffected), and only if that direct call fails — or
// is intercepted with an HTML block page — does it transparently retry the same
// request through the same-origin Nitro relay at `/api/atproto/proxy`, where the
// outbound call is made server-side and the browser proxy no longer applies.
//
// Only Bluesky-operated hosts (plus plc.directory / dns.google) are ever
// retried through the relay; requests to any other host fall straight through so
// this never changes behaviour for self-hosted PDSes or unrelated domains.

import { noCacheHeaders } from '~/lib/reload-nav'

const PROXY_ENDPOINT = '/api/atproto/proxy'

const ALLOW_EXACT = new Set([
  'plc.directory',
  'public.api.bsky.app',
  'api.bsky.app',
  'bsky.social',
  'dns.google'
])
const ALLOW_SUFFIX = ['.bsky.network', '.bsky.social', '.bsky.app']

function isProxyableHost(host: string): boolean {
  const h = host.toLowerCase()
  if (ALLOW_EXACT.has(h)) return true
  return ALLOW_SUFFIX.some(suffix => h.endsWith(suffix))
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

function relayUrl(target: string): string {
  return `${PROXY_ENDPOINT}?url=${encodeURIComponent(target)}`
}

/**
 * A drop-in `fetch` that falls back to the same-origin atproto relay when a
 * direct request to a Bluesky/atproto host is blocked by a corporate proxy.
 */
export const proxiedFetch: typeof fetch = async (input, init) => {
  const target = urlOf(input as RequestInfo | URL)

  let host = ''
  try {
    const base = typeof location !== 'undefined' ? location.origin : undefined
    host = new URL(target, base).host
  } catch {
    /* non-absolute or opaque target — nothing to proxy */
  }
  const canProxy = !!host && isProxyableHost(host)

  try {
    const res = await fetch(input as RequestInfo, init)
    if (res.ok || !canProxy) return res
    // A transparent proxy that blocks the host often answers with an HTML
    // interstitial instead of failing outright; treat that as a block too.
    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('html')) return res
  } catch (err) {
    if (!canProxy) throw err
  }

  return fetch(relayUrl(target), {
    method: init?.method,
    headers: { ...(init?.headers as Record<string, string> | undefined), ...noCacheHeaders() },
    body: init?.body,
    signal: init?.signal
  })
}

/**
 * Fetch JSON from a public atproto endpoint with the same corporate-proxy
 * fallback as {@link proxiedFetch}. `query` values that are `null`/`undefined`
 * are skipped.
 */
export async function getJson<T>(url: string, query?: Record<string, unknown>): Promise<T> {
  const u = new URL(url)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) u.searchParams.set(key, String(value))
    }
  }
  const res = await proxiedFetch(u.href, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Request to ${url} failed with ${res.status}`)
  return await res.json() as T
}
