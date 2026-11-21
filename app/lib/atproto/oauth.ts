import { configureOAuth } from '@atcute/oauth-browser-client'
import { OAUTH_SCOPE, clientMetadataUrl, oauthRedirectUri } from '#shared/atproto-oauth'
import { identityResolver } from './identity'

let configured = false

/**
 * Compute the OAuth client_id + redirect_uri for the current origin.
 *
 * - On loopback dev hosts (127.0.0.1 / localhost) atproto requires the special
 *   `http://localhost` client_id with the real redirect_uri encoded as a query param.
 *   Note: the app MUST be served from 127.0.0.1 (localhost redirect_uris are rejected).
 * - In production the hosted `client-metadata.json` document is the client_id; it is
 *   served per-origin by server/routes/client-metadata.json.get.ts.
 */
export function getOAuthMetadata(): { client_id: string; redirect_uri: string } {
  const origin = window.location.origin
  const host = window.location.hostname
  const isLoopback = host === '127.0.0.1' || host === 'localhost' || host === '[::1]'
  const redirect_uri = oauthRedirectUri(origin)

  if (isLoopback) {
    const client_id =
      `http://localhost` +
      `?redirect_uri=${encodeURIComponent(redirect_uri)}` +
      `&scope=${encodeURIComponent(OAUTH_SCOPE)}`
    return { client_id, redirect_uri }
  }

  return { client_id: clientMetadataUrl(origin), redirect_uri }
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
