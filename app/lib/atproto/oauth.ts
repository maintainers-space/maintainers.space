import { configureOAuth } from '@atcute/oauth-browser-client'
import { identityResolver } from './identity'

// Granular atproto OAuth scope — request only the collections koinon writes.
//
// koinon's authenticated PDS writes are limited to three record collections:
//
//   atproto                        → identity only (required base scope)
//   repo:dev.koinon.forgeAccount   → linked forge accounts (useForgeAccounts.ts)
//   repo:dev.koinon.repoMetadata   → repo community links / metadata
//                                    (useRepoMetadataEditor.ts)
//   repo:sh.tangled.feed.star      → starring Tangled repos (useRepoStar.ts)
//
// A bare `repo:<nsid>` (no `action=`) grants create/update/delete for that one
// collection. Everything else (profiles, follows, repos, Tangled reads) is a
// public, unauthenticated read and needs no scope.
//
// This deliberately avoids the legacy `transition:generic` scope, which grants
// full read/write to every collection (Bluesky posts, likes, follows, profile…)
// and shows users an "access to nearly everything" consent screen.
//
// NOTE: this string MUST stay in sync with the `scope` in
// public/client-metadata.json (the production client_id document) and with the
// collection constants FORGE_ACCOUNT_COLLECTION (useForgeAccounts.ts),
// REPO_METADATA_COLLECTION (lib/repo-metadata.ts) and TANGLED_STAR_COLLECTION
// (useRepoStar.ts).
export const OAUTH_SCOPE = [
  'atproto',
  'repo:dev.koinon.forgeAccount',
  'repo:dev.koinon.repoMetadata',
  'repo:sh.tangled.feed.star'
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
