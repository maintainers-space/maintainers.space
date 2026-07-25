// GitHub OAuth — step 2: exchange the authorization code for a token.
//
// This runs server-side because GitHub's token endpoint needs the client secret
// and has no CORS. The token is handed back to the SPA via the URL fragment
// (never sent to a server or written to logs), mirroring the atproto callback.
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
  const origin = getRequestURL(event).origin
  const fail = (message: string) =>
    sendRedirect(event, `/oauth/github#error=${encodeURIComponent(message)}`)

  const query = getQuery(event)
  const cookieRaw = getCookie(event, 'gh_oauth')
  deleteCookie(event, 'gh_oauth', { path: '/' })

  if (query.error) return fail(String(query.error_description || query.error))

  const { clientId, clientSecret } = useRuntimeConfig(event).github
  if (!clientId || !clientSecret) return fail('GitHub OAuth is not configured on this server.')

  let stored: {
    state?: string
    returnTo?: string
    did?: string
    claimOwner?: string
    claimName?: string
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
    const res = await $fetch<TokenResponse>('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: String(query.code),
        redirect_uri: `${origin}/api/auth/github/callback`,
        state: String(query.state)
      })
    })

    if (!res.access_token)
      return fail(res.error_description || 'GitHub did not return an access token.')

    const fragment = new URLSearchParams({
      token: res.access_token,
      scope: res.scope ?? '',
      return: safeReturn(stored.returnTo)
    })

    // Bind the (server-verified) GitHub identity to the user's atproto DID with a
    // signed attestation, so the resulting PDS record's "verified" claim can't be
    // forged. Best-effort: if signing is unconfigured or GitHub is unreachable,
    // linking still proceeds without a proof.
    if (stored.did) {
      try {
        const ghUser = await $fetch<{ login: string }>('https://api.github.com/user', {
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${res.access_token}`,
            'User-Agent': 'koinon'
          }
        })
        const signed = await signForgeAttestation({
          origin,
          did: stored.did,
          provider: 'github',
          username: ghUser.login
        })
        if (signed) {
          fragment.set('attestation', signed.attestation)
          fragment.set('attestedBy', signed.attestedBy)
        }
      } catch {
        /* attestation is best-effort; the link is still stored */
      }
    }

    await applyRepoClaim({
      fragment,
      origin,
      provider: 'github',
      token: res.access_token,
      did: stored.did,
      claimOwner: stored.claimOwner,
      claimName: stored.claimName
    })

    return sendRedirect(event, `/oauth/github#${fragment.toString()}`)
  } catch {
    return fail('Could not complete GitHub sign-in. Please try again.')
  }
})
