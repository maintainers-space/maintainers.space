// Public (unauthenticated) atproto reads. Identity resolution uses the shared
// decentralized resolver in ./identity so any handle resolves regardless of PDS;
// profile enrichment is a best-effort Bluesky AppView call and never fatal.

import { isVerifiedHandle, resolveIdentity } from './identity'
import { getJson } from './proxied-fetch'

const PUBLIC_APPVIEW = 'https://public.api.bsky.app'

/**
 * Resolve an atproto handle (or pass-through DID) to a DID string.
 * Accepts "alice.bsky.social", "@alice.npmx.social" or "did:plc:...".
 */
export async function resolveHandleToDid(identifier: string): Promise<string> {
  const id = identifier.trim().replace(/^@/, '')
  if (id.startsWith('did:')) return id
  return (await resolveIdentity(id)).did
}

export interface PublicProfile {
  did: string
  handle: string
  /** PDS service endpoint hosting this account's records. */
  pds: string
  displayName?: string
  avatar?: string
  description?: string
}

/**
 * Best-effort public profile. The DID, verified handle and PDS always come from
 * the decentralized resolver; display name / avatar / bio are enriched from the
 * Bluesky AppView when the account happens to federate a bsky profile.
 */
export async function fetchPublicProfile(actor: string): Promise<PublicProfile> {
  const ident = await resolveIdentity(actor)
  const fallback = actor.startsWith('did:') ? actor : actor.trim().replace(/^@/, '')
  const handle = isVerifiedHandle(ident.handle) ? ident.handle : fallback

  const profile: PublicProfile = { did: ident.did, handle, pds: ident.pds }

  try {
    const p = await getJson<{
      handle?: string
      displayName?: string
      avatar?: string
      description?: string
    }>(`${PUBLIC_APPVIEW}/xrpc/app.bsky.actor.getProfile`, { actor: ident.did })
    if (!isVerifiedHandle(ident.handle) && p.handle) profile.handle = p.handle
    profile.displayName = p.displayName
    profile.avatar = p.avatar
    profile.description = p.description
  } catch {
    /* no bsky profile — handle-only is fine */
  }

  return profile
}

/**
 * Public, unauthenticated read of a repository collection from an actor's PDS.
 * Works for any atproto account regardless of which PDS hosts it. Returns [] on
 * failure so profile pages degrade gracefully.
 */
export async function listPublicRecords<T = Record<string, unknown>>(
  actor: string,
  collection: string,
  limit = 100
): Promise<Array<{ uri: string; value: T }>> {
  let ident
  try {
    ident = await resolveIdentity(actor)
  } catch {
    return []
  }
  try {
    const data = await getJson<{ records?: Array<{ uri: string; value: T }> }>(
      `${ident.pds}/xrpc/com.atproto.repo.listRecords`,
      { repo: ident.did, collection, limit }
    )
    return data.records ?? []
  } catch {
    return []
  }
}

export interface FollowedAccount {
  did: string
  handle: string
  displayName?: string
  avatar?: string
}

/**
 * Accounts the given actor follows on the atproto social graph (Bluesky).
 * Best-effort and paginated up to `limit`; returns [] on any failure so callers
 * can treat "no follows" and "appview unreachable" identically.
 */
export async function fetchFollows(actor: string, limit = 100): Promise<FollowedAccount[]> {
  let did: string
  try {
    did = await resolveHandleToDid(actor)
  } catch {
    return []
  }
  const out: FollowedAccount[] = []
  let cursor: string | undefined
  try {
    for (let page = 0; page < 5; page++) {
      const res = await getJson<{
        follows?: Array<{ did?: string; handle?: string; displayName?: string; avatar?: string }>
        cursor?: string
      }>(`${PUBLIC_APPVIEW}/xrpc/app.bsky.graph.getFollows`, { actor: did, limit: 100, cursor })
      for (const f of res.follows ?? []) {
        if (f?.did)
          out.push({
            did: f.did,
            handle: f.handle ?? '',
            displayName: f.displayName,
            avatar: f.avatar
          })
      }
      cursor = res.cursor
      if (!cursor || out.length >= limit) break
    }
  } catch {
    /* best-effort — appview may be blocked or the actor may have no graph */
  }
  return out.slice(0, limit)
}
