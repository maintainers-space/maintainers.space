// Minimal, server-only atproto reads for the Explore social graph. Kept
// separate from `app/lib/atproto/public.ts` (the client's equivalent, used
// for the same purpose by `app/pages/profile/[handle].vue`) because that
// file transitively depends on a browser-only reload-detection module that
// doesn't typecheck under Nitro's non-DOM server tsconfig — the two overlap
// in intent but can't share a module across that boundary.

const PUBLIC_APPVIEW = 'https://public.api.bsky.app'

/** Must match `FORGE_ACCOUNT_COLLECTION` in `app/composables/useForgeAccounts.ts`. */
export const FORGE_ACCOUNT_COLLECTION = 'space.maintainers.forgeAccount'

export interface GraphFollow {
  did: string
  handle: string
  displayName?: string
  avatar?: string
}

/** Accounts `did` follows on the atproto social graph (Bluesky), best-effort. */
export async function fetchFollowsServer(did: string, limit = 100): Promise<GraphFollow[]> {
  const out: GraphFollow[] = []
  let cursor: string | undefined
  try {
    for (let page = 0; page < 5; page++) {
      const res = await $fetch<{
        follows?: Array<{ did?: string; handle?: string; displayName?: string; avatar?: string }>
        cursor?: string
      }>(`${PUBLIC_APPVIEW}/xrpc/app.bsky.graph.getFollows`, {
        query: { actor: did, limit: 100, cursor }
      })
      for (const f of res.follows ?? []) {
        if (f?.did) {
          out.push({
            did: f.did,
            handle: f.handle ?? '',
            displayName: f.displayName,
            avatar: f.avatar
          })
        }
      }
      cursor = res.cursor
      if (!cursor || out.length >= limit) break
    }
  } catch {
    /* best-effort — appview may be blocked or the actor may have no graph */
  }
  return out.slice(0, limit)
}

interface DidServiceEndpoint {
  id?: string
  type?: string
  serviceEndpoint?: string
}

/**
 * Resolve a `did:plc:`/`did:web:` DID to its PDS service endpoint.
 *
 * `responseType: 'json'` is required, not decorative: plc.directory answers with
 * `content-type: application/did+ld+json`, and ofetch's content-type sniffing
 * only recognises a single `+`-suffixed token (`application/<x>+json`). The two
 * suffixes in `did+ld+json` fail that test, so without this the body comes back
 * as an unparsed string and every did:plc silently looks like it has no PDS.
 */
export async function resolvePds(did: string): Promise<string> {
  const doc = did.startsWith('did:web:')
    ? await $fetch<{ service?: DidServiceEndpoint[] }>(
        `https://${decodeURIComponent(did.slice('did:web:'.length))}/.well-known/did.json`,
        { responseType: 'json' }
      )
    : await $fetch<{ service?: DidServiceEndpoint[] }>(
        `https://plc.directory/${encodeURIComponent(did)}`,
        { responseType: 'json' }
      )
  const pds = doc.service?.find((s) => s.type === 'AtprotoPersonalDataServer')?.serviceEndpoint
  if (!pds) throw new Error(`No PDS service found for ${did}`)
  return pds
}

/** Public, unauthenticated read of a repo record collection from `did`'s own PDS. */
export async function listPublicRecordsServer<T>(
  did: string,
  collection: string,
  limit = 100
): Promise<Array<{ uri: string; value: T }>> {
  try {
    const pds = await resolvePds(did)
    const data = await $fetch<{ records?: Array<{ uri: string; value: T }> }>(
      `${pds}/xrpc/com.atproto.repo.listRecords`,
      { query: { repo: did, collection, limit } }
    )
    return data.records ?? []
  } catch {
    return []
  }
}
