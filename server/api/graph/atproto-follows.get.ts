/**
 * Cached, same-origin wrapper around the public atproto follow graph
 * (`app.bsky.graph.getFollows`), for the Explore social graph. Safe to expose
 * with a `did` rather than a raw URL: the upstream AppView host is fixed
 * (never client-controlled).
 *
 * `GET /api/graph/atproto-follows?did=<did>&limit=<n>`
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const did = String(query.did ?? '')
  if (!did.startsWith('did:')) {
    throw createError({ statusCode: 400, statusMessage: 'A valid did is required.' })
  }
  const limit = Number(query.limit ?? 100) || 100

  const noCache = (getHeader(event, 'cache-control') || '').toLowerCase().includes('no-cache')
  if (noCache) setNoStore(event)
  else setCacheHeaders(event, CACHE_SOCIAL_GRAPH)

  return await fetchFollowsServer(did, limit)
})
