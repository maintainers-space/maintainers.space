interface ForgeAccountValue {
  provider?: string
  username?: string
  host?: string
  displayName?: string
  avatarUrl?: string
  profileUrl?: string
}

/**
 * Cached, same-origin wrapper around a person's public `space.maintainers.forgeAccount`
 * records — every forge account they've linked through maintainers.space — for the
 * Explore social graph's cross-provider identity merge (see
 * `app/pages/profile/[handle].vue`, which reads the exact same records
 * client-side for the profile page). Safe to expose with a `did` rather than
 * a raw URL: the target PDS is resolved server-side, never a client-supplied
 * URL.
 *
 * `GET /api/graph/forge-accounts?did=<did>`
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const did = String(query.did ?? '')
  if (!did.startsWith('did:')) {
    throw createError({ statusCode: 400, statusMessage: 'A valid did is required.' })
  }

  const noCache = (getHeader(event, 'cache-control') || '').toLowerCase().includes('no-cache')
  if (noCache) setNoStore(event)
  else setCacheHeaders(event, CACHE_SOCIAL_GRAPH)

  const records = await listPublicRecordsServer<ForgeAccountValue>(did, FORGE_ACCOUNT_COLLECTION)
  return records.map((r) => r.value).filter((a) => a?.provider && a?.username)
})
