// Public (unauthenticated) atproto reads via the public Bluesky AppView.
// Uses plain $fetch — no auth/DPoP needed for these endpoints.

const PUBLIC_APPVIEW = 'https://public.api.bsky.app'

/**
 * Resolve an atproto handle (or pass-through DID) to a DID string.
 * Accepts "alice.bsky.social", "@alice.bsky.social" or "did:plc:...".
 */
export async function resolveHandleToDid(identifier: string): Promise<string> {
  const id = identifier.trim().replace(/^@/, '')
  if (id.startsWith('did:')) return id
  const data = await $fetch<{ did: string }>(
    `${PUBLIC_APPVIEW}/xrpc/com.atproto.identity.resolveHandle`,
    { query: { handle: id } }
  )
  return data.did
}

export interface PublicProfile {
  did: string
  handle: string
  displayName?: string
  avatar?: string
  description?: string
}

/** Best-effort public profile lookup (handle, display name, avatar). */
export async function fetchPublicProfile(actor: string): Promise<PublicProfile> {
  const data = await $fetch<{
    did?: string
    handle?: string
    displayName?: string
    avatar?: string
    description?: string
  }>(`${PUBLIC_APPVIEW}/xrpc/app.bsky.actor.getProfile`, { query: { actor } })

  return {
    did: data.did ?? actor,
    handle: data.handle ?? actor,
    displayName: data.displayName,
    avatar: data.avatar,
    description: data.description
  }
}
