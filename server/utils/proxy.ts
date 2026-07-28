import type { H3Event } from 'h3'
import type { CachePolicy } from './cache'
import { setCacheHeaders, setNoStore } from './cache'

function upstreamError(err: unknown): never {
  const e = err as {
    response?: { status?: number; statusText?: string }
    statusCode?: number
    statusMessage?: string
    data?: unknown
  }
  throw createError({
    statusCode: e.response?.status ?? e.statusCode ?? 502,
    statusMessage: e.response?.statusText ?? e.statusMessage ?? 'Upstream request failed',
    data: e.data
  })
}

/**
 * Forward the current request to an upstream URL and return its JSON body.
 *
 * This exists so the browser can reach APIs that don't send CORS headers
 * (e.g. Tangled's `api.tangled.org` aggregator) or that a corporate proxy
 * blocks from the client: the request is made server-side from Nitro, where
 * neither restriction applies, and served back same-origin.
 *
 * When a `cachePolicy` is given and the request is a cacheable GET, rising
 * browser/CDN/Netlify cache headers are emitted so the same upstream call is
 * not repeated for every viewer. Writes (POST/…) are always marked no-store.
 */
export async function proxyJson(
  event: H3Event,
  targetUrl: string,
  cachePolicy?: CachePolicy
): Promise<unknown> {
  const method = event.method.toUpperCase()
  const hasBody = method !== 'GET' && method !== 'HEAD'
  const noCache = (getHeader(event, 'cache-control') || '').toLowerCase().includes('no-cache')
  if (cachePolicy && !hasBody && !noCache) setCacheHeaders(event, cachePolicy)
  else if (hasBody || noCache) setNoStore(event)
  try {
    return await $fetch(targetUrl, {
      method: method as 'GET' | 'POST',
      query: hasBody ? undefined : getQuery(event),
      body: hasBody ? await readBody(event).catch(() => undefined) : undefined,
      headers: { Accept: 'application/json' }
    })
  } catch (err) {
    upstreamError(err)
  }
}

/**
 * Forward the current request to an upstream URL and return its raw text body,
 * with caller-supplied headers (e.g. a bearer token the upstream needs). Used
 * for upstream responses that a JSON proxy can't represent, or whose final
 * (possibly redirected) response has CORS locked to the upstream's own origin.
 */
export async function proxyText(
  event: H3Event,
  targetUrl: string,
  headers: Record<string, string> = {}
): Promise<string> {
  setNoStore(event)
  try {
    return await $fetch<string>(targetUrl, { headers, responseType: 'text' })
  } catch (err) {
    upstreamError(err)
  }
}
