/**
 * Guarded same-origin relay for public atproto/Bluesky reads.
 *
 * Some corporate networks block every Bluesky-operated domain at the browser
 * proxy. That breaks identity resolution and every public read (profiles,
 * repos, follows, notifications) even though none of it needs authentication.
 * Routing those requests through Nitro — which makes the outbound call
 * server-side, where the browser proxy doesn't apply — restores them.
 *
 * `GET|POST /api/atproto/proxy?url=<absolute https url>` -> relays that URL.
 *
 * To avoid turning this into an open SSRF proxy, only a fixed allow-list of
 * Bluesky infrastructure hosts (plus plc.directory / dns.google, the two
 * non-Bluesky hosts atproto identity resolution relies on) may be targeted.
 */
const ALLOW_EXACT = new Set([
  'plc.directory',
  'public.api.bsky.app',
  'api.bsky.app',
  'bsky.social',
  'dns.google'
])
const ALLOW_SUFFIX = ['.bsky.network', '.bsky.social', '.bsky.app']

function isAllowedHost(host: string): boolean {
  const h = host.toLowerCase()
  if (ALLOW_EXACT.has(h)) return true
  return ALLOW_SUFFIX.some(suffix => h.endsWith(suffix))
}

export default defineEventHandler(async (event) => {
  const target = getQuery(event).url
  if (typeof target !== 'string' || !target) {
    throw createError({ statusCode: 400, statusMessage: 'Missing url parameter' })
  }

  let parsed: URL
  try {
    parsed = new URL(target)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid url parameter' })
  }

  if (parsed.protocol !== 'https:') {
    throw createError({ statusCode: 400, statusMessage: 'Only https targets are allowed' })
  }
  if (!isAllowedHost(parsed.hostname)) {
    throw createError({ statusCode: 403, statusMessage: 'Target host is not allowed' })
  }

  const method = event.method.toUpperCase()
  const hasBody = method !== 'GET' && method !== 'HEAD'

  let upstream: Response
  try {
    upstream = await fetch(parsed.href, {
      method,
      headers: { Accept: getHeader(event, 'accept') || 'application/json' },
      body: hasBody ? await readRawBody(event).catch(() => undefined) : undefined
    })
  } catch (err) {
    throw createError({
      statusCode: 502,
      statusMessage: `Upstream request failed: ${(err as Error).message}`
    })
  }

  setResponseStatus(event, upstream.status)
  const contentType = upstream.headers.get('content-type')
  if (contentType) setResponseHeader(event, 'content-type', contentType)
  // Public atproto reads (identity, profiles, repos, follows) are identical for
  // every viewer, so let the browser/CDN/Netlify hold them for a few minutes.
  // Writes and non-200s are never shared-cached.
  if (!hasBody && upstream.ok && !(getHeader(event, 'cache-control') || '').toLowerCase().includes('no-cache')) setCacheHeaders(event, CACHE_MEDIUM)
  else setNoStore(event)
  return await upstream.text()
})
