import { configureOAuth } from '@atcute/oauth-browser-client'
import { identityResolver } from './identity'

// Granular atproto OAuth scope — request only what koinon actually uses.
//
// koinon's ONLY authenticated PDS operation is reading/writing its own account
// links in the `dev.koinon.forgeAccount` collection (see useForgeAccounts.ts).
// Everything else (profiles, follows, repos, Tangled data) is a public,
// unauthenticated read and needs no scope.
//
//   atproto                        → identity only (required base scope)
//   repo:dev.koinon.forgeAccount   → create/update/delete records in that one
//                                    collection (no `action=` means all three)
//
// This deliberately avoids the legacy `transition:generic` scope, which grants
// full read/write to every collection (Bluesky posts, likes, follows, profile…)
// and shows users an "access to nearly everything" consent screen.
//
// NOTE: this string MUST stay in sync with the `scope` in
// public/client-metadata.json (the production client_id document) and with the
// FORGE_ACCOUNT_COLLECTION constant in useForgeAccounts.ts.
export const FORGE_ACCOUNT_SCOPE = 'repo:dev.koinon.forgeAccount'
export const OAUTH_SCOPE = `atproto ${FORGE_ACCOUNT_SCOPE}`

let configured = false

/**
 * Compute the OAuth client_id + redirect_uri for the current origin.
 *
 * - On loopback dev hosts (127.0.0.1 / localhost) atproto requires the special
 *   `http://localhost` client_id with the real redirect_uri encoded as a query param.
 *   Note: the app MUST be served from 127.0.0.1 (localhost redirect_uris are rejected).
 * - In production the hosted `client-metadata.json` document is the client_id.
 */
export function getOAuthMetadata(): { client_id: string, redirect_uri: string } {
  const origin = window.location.origin
  const host = window.location.hostname
  const isLoopback = host === '127.0.0.1' || host === 'localhost' || host === '[::1]'
  const redirect_uri = `${origin}/oauth/callback`

  if (isLoopback) {
    const client_id
      = `http://localhost`
        + `?redirect_uri=${encodeURIComponent(redirect_uri)}`
        + `&scope=${encodeURIComponent(OAUTH_SCOPE)}`
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
