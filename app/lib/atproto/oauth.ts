import { configureOAuth } from '@atcute/oauth-browser-client'
import { APPVIEW_SERVICE_ID } from '~/lib/chat/config'
import { identityResolver } from './identity'

// Granular atproto OAuth scope — request only the collections maintainers.space writes.
//
// maintainers.space's authenticated PDS writes are limited to a handful of record
// collections:
//
//   atproto                              → identity only (required base scope)
//   repo:space.maintainers.forgeAccount  → linked forge accounts (useForgeAccounts.ts)
//   repo:sh.tangled.feed.star            → starring Tangled repos (useRepoStar.ts)
//   repo:social.colibri.message          → chat messages, own PDS (useChatMessages.ts)
//
// A bare `repo:<nsid>` (no `action=`) grants create/update/delete for that one
// collection. Everything else (profiles, follows, repos, Tangled reads) is a
// public, unauthenticated read and needs no scope.
//
// Chat also needs two of Colibri's own published permission-sets — bundles of
// RPC + repo permissions scoped to a specific AppView's did:web, referenced
// with a single `include:` scope rather than hand-listing every collection/RPC
// they cover (see https://atproto.com/specs/permission#permission-sets and
// social.colibri.permissionCommunity / permissionMessaging in
// https://github.com/colibri-social/appview/tree/main/lexicons). Voice
// (permissionPush, social.colibri.voice.*) and push notifications
// (permissionNotification) are deliberately omitted — this is a text-only v1.
//
// This deliberately avoids the legacy `transition:generic` scope, which grants
// full read/write to every collection (Bluesky posts, likes, follows, profile…)
// and shows users an "access to nearly everything" consent screen.
//
// NOTE: this string MUST stay in sync with the `scope` in
// public/client-metadata.json (the production client_id document) and with the
// collection constants FORGE_ACCOUNT_COLLECTION (useForgeAccounts.ts),
// TANGLED_STAR_COLLECTION (useRepoStar.ts) and MESSAGE_COLLECTION
// (useChatMessages.ts). Already-signed-in users don't gain a newly-added scope
// automatically — they must re-consent; see useChatCommunity.ts's handling of
// InvalidToken-shaped errors from calls that need it.
export const OAUTH_SCOPE = [
  'atproto',
  'repo:space.maintainers.forgeAccount',
  'repo:sh.tangled.feed.star',
  'repo:social.colibri.message',
  `include:social.colibri.permissionAccount?aud=${APPVIEW_SERVICE_ID}`,
  `include:social.colibri.permissionCommunity?aud=${APPVIEW_SERVICE_ID}`,
  `include:social.colibri.permissionMessaging?aud=${APPVIEW_SERVICE_ID}`
].join(' ')

let configured = false

/**
 * Compute the OAuth client_id + redirect_uri for the current origin.
 *
 * - On loopback dev hosts (127.0.0.1 / localhost) atproto requires the special
 *   `http://localhost` client_id with the real redirect_uri encoded as a query param.
 *   Note: the app MUST be served from 127.0.0.1 (localhost redirect_uris are rejected).
 * - In production the hosted `client-metadata.json` document is the client_id.
 */
export function getOAuthMetadata(): { client_id: string; redirect_uri: string } {
  const origin = window.location.origin
  const host = window.location.hostname
  const isLoopback = host === '127.0.0.1' || host === 'localhost' || host === '[::1]'
  const redirect_uri = `${origin}/oauth/callback`

  if (isLoopback) {
    const client_id =
      `http://localhost` +
      `?redirect_uri=${encodeURIComponent(redirect_uri)}` +
      `&scope=${encodeURIComponent(OAUTH_SCOPE)}`
    return { client_id, redirect_uri }
  }

  return { client_id: `${origin}/client-metadata.json`, redirect_uri }
}

/** Configure the atcute OAuth browser client. Safe to call multiple times. */
export function configureAtprotoOAuth(): void {
  if (configured) return
  configured = true

  configureOAuth({
    metadata: getOAuthMetadata(),
    identityResolver
  })
}
