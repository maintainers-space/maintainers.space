// Codeberg OAuth — step 2: exchange the authorization code for a token.
//
// Runs server-side because Codeberg's (Forgejo) token endpoint needs the client
// secret. The token is handed back to the SPA via the URL fragment (never
// logged), mirroring the GitHub and GitLab callbacks.
interface TokenResponse {
  access_token?: string
  token_type?: string
  refresh_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

function safeReturn(raw: unknown): string {
  const value = typeof raw === 'string' ? raw : ''
  return value.startsWith('/') && !value.startsWith('//') ? value : '/settings/accounts'
}

export default defineEventHandler(async (event) => {
  const origin = getRequestURL(event).origin
  const fail = (message: string) =>
    sendRedirect(event, `/oauth/codeberg#error=${encodeURIComponent(message)}`)

  const query = getQuery(event)
  const cookieRaw = getCookie(event, 'cb_oauth')
  deleteCookie(event, 'cb_oauth', { path: '/' })

  if (query.error) return fail(String(query.error_description || query.error))

  const { clientId, clientSecret } = useRuntimeConfig(event).codeberg
  if (!clientId || !clientSecret) return fail('Codeberg OAuth is not configured on this server.')

  let stored: { state?: string, returnTo?: string, did?: string } = {}
  try {
    stored = cookieRaw ? JSON.parse(cookieRaw) : {}
  } catch { /* fall through to state mismatch */ }

  if (!query.code || !query.state || query.state !== stored.state) {
    return fail('Invalid or expired sign-in request. Please try again.')
  }

  try {
    const res = await $fetch<TokenResponse>('https://codeberg.org/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: String(query.code),
        grant_type: 'authorization_code',
        redirect_uri: `${origin}/api/auth/codeberg/callback`
      })
    })

    if (!res.access_token) return fail(res.error_description || 'Codeberg did not return an access token.')

    const fragment = new URLSearchParams({
      token: res.access_token,
      return: safeReturn(stored.returnTo)
    })

    // Bind the (server-verified) Codeberg identity to the user's atproto DID with
    // a signed attestation so the record's "verified" claim can't be forged.
    if (stored.did) {
      try {
        const cbUser = await $fetch<{ login: string }>('https://codeberg.org/api/v1/user', {
          headers: { Authorization: `Bearer ${res.access_token}` }
        })
        const signed = await signForgeAttestation({
          origin,
          did: stored.did,
          provider: 'codeberg',
          username: cbUser.login
        })
        if (signed) {
          fragment.set('attestation', signed.attestation)
          fragment.set('attestedBy', signed.attestedBy)
        }
      } catch { /* attestation is best-effort; the link is still stored */ }
    }

    return sendRedirect(event, `/oauth/codeberg#${fragment.toString()}`)
  } catch {
    return fail('Could not complete Codeberg sign-in. Please try again.')
  }
})
