/**
 * Cached, same-origin passthrough for anonymous (no-token) forge search reads.
 *
 * Search is otherwise fetched straight from the browser to each forge's public
 * API, so anonymous callers share that forge's (often strict) unauthenticated
 * rate limit with every other koinon visitor. Routing the no-token case through
 * here instead lets a repeat of the same query be served from the browser/CDN/
 * Netlify edge cache (see `CACHE_SEARCH`) rather than re-hitting the forge.
 *
 * `GET /api/search-proxy?url=<allowlisted forge API URL>&accept=<Accept header>&...`
 * forwards every other query param to `url` and returns its JSON body.
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const url = String(query.url ?? '')
  if (!isAllowedSearchUrl(url)) {
    throw createError({ statusCode: 400, statusMessage: 'Unsupported search proxy target.' })
  }
  const accept = typeof query.accept === 'string' ? query.accept : 'application/json'

  const upstreamQuery = { ...query }
  delete upstreamQuery.url
  delete upstreamQuery.accept

  const noCache = (getHeader(event, 'cache-control') || '').toLowerCase().includes('no-cache')
  if (noCache) setNoStore(event)
  else setCacheHeaders(event, CACHE_SEARCH)

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
      statusMessage: e.response?.statusText ?? e.statusMessage ?? 'Upstream search request failed',
      data: e.data
    })
  }
})
