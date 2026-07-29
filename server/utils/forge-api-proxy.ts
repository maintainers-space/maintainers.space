import type { CachePolicy } from './cache'
import { setCacheHeaders, setNoStore } from './cache'
import { isAllowedForgeApiUrl } from './forge-api-allowlist'

/**
 * Build a cached, same-origin passthrough handler for anonymous (no-token)
 * forge API reads. Validates `?url=` against the shared allowlist, forwards
 * every other query param, and caches the response under `policy` unless the
 * request explicitly asks not to (`Cache-Control: no-cache`, used once after
 * a full page reload on Search).
 */
export function createForgeApiProxyHandler(policy: CachePolicy) {
  return defineEventHandler(async (event) => {
    const query = getQuery(event)
    const url = String(query.url ?? '')
    if (!isAllowedForgeApiUrl(url)) {
      throw createError({ statusCode: 400, statusMessage: 'Unsupported forge API proxy target.' })
    }
    const accept = typeof query.accept === 'string' ? query.accept : 'application/json'

    const upstreamQuery = { ...query }
    delete upstreamQuery.url
    delete upstreamQuery.accept

    const noCache = (getHeader(event, 'cache-control') || '').toLowerCase().includes('no-cache')
    if (noCache) setNoStore(event)
    else setCacheHeaders(event, policy)

    try {
      return await $fetch(url, { query: upstreamQuery, headers: { Accept: accept } })
    } catch (err) {
      const e = err as {
        response?: { status?: number; statusText?: string }
        statusCode?: number
        statusMessage?: string
        data?: unknown
      }
      throw createError({
        statusCode: e.response?.status ?? e.statusCode ?? 502,
        statusMessage: e.response?.statusText ?? e.statusMessage ?? 'Upstream forge request failed',
        data: e.data
      })
    }
  })
}
