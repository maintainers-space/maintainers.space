// Forge OAuth — step 2: exchange the authorization code for a token.
//
// One handler for every forge (see server/utils/oauth-providers.ts). This runs
// server-side because every forge's token endpoint needs the client secret and
// has no CORS. The token is handed back to the SPA via the URL fragment (never
// sent to a server or logged), mirroring the atproto callback.
interface TokenResponse {
  access_token?: string
  scope?: string
  token_type?: string
  error?: string
  error_description?: string
}

function safeReturn(raw: unknown): string {
  const value = typeof raw === 'string' ? raw : ''
  return value.startsWith('/') && !value.startsWith('//') ? value : '/settings/accounts'
}

export default defineEventHandler(async (event) => {
  const providerId = String(getRouterParam(event, 'provider') ?? '')
  const origin = getRequestURL(event).origin
  const fail = (message: string) =>
    sendRedirect(event, `/oauth/${providerId}#error=${encodeURIComponent(message)}`)

  const provider = getOAuthProvider(providerId)
  if (!provider) return fail(`Unknown forge "${providerId}".`)

  const query = getQuery(event)
  const cookieName = `oauth_${providerId}`
  const cookieRaw = getCookie(event, cookieName)
  deleteCookie(event, cookieName, { path: '/' })

  if (query.error) return fail(String(query.error_description || query.error))

  const credentials = getOAuthCredentials(event, providerId)
  if (!credentials) return fail(`${provider.label} OAuth is not configured on this server.`)

  let stored: {
    state?: string
    returnTo?: string
    did?: string
  } = {}
  try {
    stored = cookieRaw ? JSON.parse(cookieRaw) : {}
  } catch {
    /* fall through to state mismatch */
  }

  if (!query.code || !query.state || query.state !== stored.state) {
    return fail('Invalid or expired sign-in request. Please try again.')
  }

  try {
    const redirectUri = `${origin}/api/auth/${providerId}/callback`
    const basicAuth = provider.tokenAuthStyle === 'basic'
    const body = new URLSearchParams({
      code: String(query.code),
      grant_type: 'authorization_code',
      // Omitted here too when the authorize request never sent one — sending it
      // now would no longer match "no redirect_uri was used at authorization".
      ...(provider.fixedRedirectUri ? {} : { redirect_uri: redirectUri }),
      ...(basicAuth
        ? {}
        : { client_id: credentials.clientId, client_secret: credentials.clientSecret })
    })
    const res = await $fetch<TokenResponse>(provider.tokenUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        // Some token endpoints (sr.ht) strictly match this header rather than
        // inferring it from the body, and reject the
        // "...;charset=UTF-8" suffix a bare URLSearchParams body produces.
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(basicAuth
          ? {
              Authorization: `Basic ${btoa(`${credentials.clientId}:${credentials.clientSecret}`)}`
            }
          : {})
      },
      body
    })

    if (!res.access_token)
      return fail(res.error_description || `${provider.label} did not return an access token.`)

    const fragment = new URLSearchParams({
      token: res.access_token,
      scope: res.scope ?? '',
      return: safeReturn(stored.returnTo)
    })

    // Bind the (server-verified) forge identity to the user's atproto DID with a
    // signed attestation, so the resulting PDS record's "verified" claim can't be
    // forged. Best-effort: if signing is unconfigured or the forge is
    // unreachable, linking still proceeds without a proof.
    if (stored.did) {
      try {
        const username = await provider.fetchUsername(res.access_token)
        const signed = await signForgeAttestation({
          origin,
          did: stored.did,
          provider: providerId,
          username
        })
        if (signed) {
          fragment.set('attestation', signed.attestation)
          fragment.set('attestedBy', signed.attestedBy)
        }
      } catch {
        /* attestation is best-effort; the link is still stored */
      }
    }

    return sendRedirect(event, `/oauth/${providerId}#${fragment.toString()}`)
  } catch (err) {
    // Surface the upstream OAuth error (e.g. invalid_grant, invalid_client, a
    // redirect_uri mismatch on the forge's own client registration) instead of
    // a generic message that hides the real cause.
    const e = err as { data?: { error?: string; error_description?: string } }
    const detail = e.data?.error_description || e.data?.error
    return fail(detail || `Could not complete ${provider.label} sign-in. Please try again.`)
  }
})
