// Detect a page reload (F5 or Ctrl+Shift+R) and, for a short window afterwards,
// ask same-origin proxy reads to bypass the shared CDN cache. A fresh boot
// already empties the in-memory client cache, so only Netlify's durable edge
// could still hand back a stale copy of a proxied read; sending `no-cache` on
// those requests makes the edge revalidate against origin.
//
// Scoped to same-origin proxy endpoints on purpose: adding a `Cache-Control`
// header to a cross-origin request is not CORS-safelisted and would force a
// preflight, so direct atproto/Bluesky reads are left to the browser's own
// reload semantics.

let bypassUntil = 0

if (import.meta.client) {
  try {
    const [nav] = performance.getEntriesByType('navigation') as Array<{ type?: string }>
    if (nav?.type === 'reload') bypassUntil = Date.now() + 10_000
  } catch {
    /* Performance API unavailable — no bypass, normal caching applies. */
  }
}

/** True during the brief window after a manual reload. */
export function reloadBypassActive(): boolean {
  return Date.now() < bypassUntil
}

/**
 * Headers to spread into a same-origin proxy read. While a reload bypass is
 * active this yields `Cache-Control: no-cache`; otherwise it is empty.
 */
export function noCacheHeaders(): Record<string, string> {
  return reloadBypassActive() ? { 'cache-control': 'no-cache' } : {}
}
