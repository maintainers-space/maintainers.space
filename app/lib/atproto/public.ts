// Public (unauthenticated) atproto reads.
//
// Identity resolution goes through the shared, decentralized resolver in
// ./identity so ANY handle resolves (regardless of PDS). Profile enrichment is
// a best-effort call to the public Bluesky AppView and is never fatal.

import { isVerifiedHandle, resolveIdentity } from './identity'

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
    const p = await $fetch<{
      handle?: string
      displayName?: string
      avatar?: string
      description?: string
    }>(`${PUBLIC_APPVIEW}/xrpc/app.bsky.actor.getProfile`, { query: { actor: ident.did } })
    if (!isVerifiedHandle(ident.handle) && p.handle) profile.handle = p.handle
    profile.displayName = p.displayName
    profile.avatar = p.avatar
    profile.description = p.description
  } catch {
    /* no bsky profile — handle-only is fine */
  }

  return profile
}
