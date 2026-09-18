// Single source of truth for the atproto OAuth client's scope and metadata
// document shape, shared by the browser OAuth setup (app/lib/atproto/oauth.ts)
// and the PDS-facing client-metadata endpoint (server/routes/client-metadata.json.get.ts).
//
// atproto registers public web clients on the fly: the authorization server
// (the user's PDS) fetches the metadata document from the `client_id` URL at the
// start of every flow, and requires the document's `client_id` to match that URL
// and its `redirect_uris` to contain the requested callback. The endpoint
// therefore builds the document from the current request origin, so a branch
// deploy served on any host (e.g. main.maintainers.space) presents a client that
// the PDS accepts for that host.

// Granular atproto OAuth scope — request only the collections maintainers.space writes.
//
// maintainers.space's authenticated PDS writes are limited to two record collections:
//
//   atproto                              → identity only (required base scope)
//   repo:space.maintainers.forgeAccount  → linked forge accounts (useForgeAccounts.ts)
//   repo:sh.tangled.feed.star            → starring Tangled repos (useRepoStar.ts)
//
// A bare `repo:<nsid>` (no `action=`) grants create/update/delete for that one
// collection. Everything else (profiles, follows, repos, Tangled reads) is a
// public, unauthenticated read and needs no scope.
//
// This deliberately avoids the legacy `transition:generic` scope, which grants
// full read/write to every collection (Bluesky posts, likes, follows, profile…)
// and shows users an "access to nearly everything" consent screen.
//
// NOTE: this string MUST stay in sync with the collection constants
// FORGE_ACCOUNT_COLLECTION (useForgeAccounts.ts) and
// TANGLED_STAR_COLLECTION (useRepoStar.ts).
export const OAUTH_SCOPE = [
  'atproto',
  'repo:space.maintainers.forgeAccount',
  'repo:sh.tangled.feed.star'
].join(' ')

/** The `client_id` document URL atproto fetches for a given origin/host. */
export function clientMetadataUrl(origin: string): string {
  return `${origin}/client-metadata.json`
}

/** The SPA route the PDS redirects the browser back to after consent. */
export function oauthRedirectUri(origin: string): string {
  return `${origin}/oauth/callback`
}

export interface AtprotoClientMetadata {
  client_id: string
  client_name: string
  client_uri: string
  redirect_uris: string[]
  scope: string
  grant_types: ['authorization_code', 'refresh_token']
  response_types: ['code']
  token_endpoint_auth_method: 'none'
  application_type: 'web'
  dpop_bound_access_tokens: true
}

/** Build the atproto client metadata document for the current origin. */
export function buildAtprotoClientMetadata(origin: string): AtprotoClientMetadata {
  return {
    client_id: clientMetadataUrl(origin),
    client_name: 'maintainers.space',
    client_uri: origin,
    redirect_uris: [oauthRedirectUri(origin)],
    scope: OAUTH_SCOPE,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    application_type: 'web',
    dpop_bound_access_tokens: true
  }
}
