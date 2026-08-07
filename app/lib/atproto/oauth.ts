import { configureOAuth } from '@atcute/oauth-browser-client'
import { identityResolver } from './identity'

// Granular atproto OAuth scope. Requests only what maintainers.space actually uses.
//
// maintainers.space's own authenticated PDS writes are limited to two record
// collections:
//
//   repo:space.maintainers.forgeAccount  → linked forge accounts (useForgeAccounts.ts)
//   repo:sh.tangled.feed.star            → starring Tangled repos (useRepoStar.ts)
//
// A bare `repo:<nsid>` (no `action=`) grants create/update/delete for that one
// collection. Everything else (profiles, follows, repos, Tangled reads) is a
// public, unauthenticated read and needs no scope.
//
// Chat's permissions come from @colibri-social/client's own buildScopes() (see
// shared/utils/oauth-scope.ts), which supplies blob uploads, two voice RPCs, and
// five of Colibri's published permission-sets, which bundle RPC + repo permissions
// pinned to a specific AppView's did:web and referenced with a single `include:`
// scope rather than hand-listing every collection and RPC they cover (see
// https://atproto.com/specs/permission#permission-sets). It is imported rather
// than transcribed because the embedded client's own ScopeGate blocks the whole
// chat UI when any one of those five sets is missing, so a hand-maintained copy
// that drifts would break chat with no way for the embed to recover.
//
// Those are NOT requested at sign-in. Signing in asks for getBaseScope() only,
// and the Chat tab asks for getChatScope() when someone first opens it, so nobody
// grants access to their messages for a feature they never use. An authorization
// request may narrow the scope its client declares but never exceed it, which is
// why the client metadata (both the loopback client_id below and
// server/routes/client-metadata.json.get.ts) still declares the full set.
//
// This deliberately avoids the legacy `transition:generic` scope, which grants
// full read/write to every collection (Bluesky posts, likes, follows, profile…)
// and shows users an "access to nearly everything" consent screen.
//
// NOTE: the `include:` audiences pin runtimeConfig.public.colibriAppviewUrl's
// did:web and are matched by exact string equality, so this and
// server/routes/client-metadata.json.get.ts must resolve the same AppView URL.
// That URL must also be resolvable *by the PDS*, which silently drops any
// `include:` scope whose `aud` it cannot resolve while granting everything else,
// so pointing it at a loopback AppView costs you exactly the permission sets.
export function getBaseScope(): string {
  return baseScope()
}

export function getChatScope(): string {
  return chatScope(useRuntimeConfig().public.colibriAppviewUrl)
}

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
      `&scope=${encodeURIComponent(getChatScope())}`
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
