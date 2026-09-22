// Forge OAuth — step 1: redirect the browser to the forge's consent screen.
//
// One handler for every forge (see server/utils/oauth-providers.ts): linking an
// account is verified through OAuth rather than typing a username, and the
// client secret never leaves the server.
function safeReturn(raw: unknown): string {
  const value = typeof raw === 'string' ? raw : ''
  // Only allow same-app absolute paths (avoid open redirects).
  return value.startsWith('/') && !value.startsWith('//') ? value : '/settings/accounts'
}

// The `preview` query parameter lets a preview deployment (e.g. a per-PR build on
// *.pages.dev / *.onrender.com) receive the OAuth token fragment from the shared
// callback. It is attacker-controllable — the flow runs in the victim's browser
// and the OAuth `state` does not bind the origin — so `startsWith('https://')` is
// not enough: an attacker could start a flow with `preview=https://attacker.example`
// and receive the victim's access token. Only origins matching the configured
// allowlist (NUXT_PREVIEW_ORIGINS) are trusted; everything else is rejected.
function allowedPreviewOrigin(raw: unknown, patterns: string[]): string | undefined {
  if (typeof raw !== 'string' || !raw) return undefined
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return undefined
  }
  // Bare https origins only — no credentials, and normalise away any path/query.
  if (url.protocol !== 'https:' || url.username || url.password) return undefined
  const host = url.hostname.toLowerCase()
  for (const pattern of patterns) {
    if (pattern.startsWith('https://*.')) {
      const suffix = pattern.slice('https://*.'.length).toLowerCase()
      if (suffix && (host === suffix || host.endsWith(`.${suffix}`))) return url.origin
    } else if (url.origin === pattern) {
      return url.origin
    }
  }
  return undefined
}

export default defineEventHandler((event) => {
  const providerId = String(getRouterParam(event, 'provider') ?? '')
  const provider = getOAuthProvider(providerId)
  if (!provider) {
    throw createError({ statusCode: 404, statusMessage: `Unknown forge "${providerId}".` })
  }

  const credentials = getOAuthCredentials(event, providerId)
  if (!credentials) {
    throw createError({
      statusCode: 501,
      statusMessage: `${provider.label} OAuth is not configured on this server.`
    })
  }

  const origin = getRequestURL(event).origin
  const state = crypto.randomUUID()
  const returnTo = safeReturn(getQuery(event).redirect)
  // The atproto DID to bind the attestation to. Asserted by the client; safe
  // because verifiers require the signed `sub` to equal the record owner's DID,
  // and a user can only write the resulting record to their own repo.
  const rawDid = getQuery(event).did
  const did = typeof rawDid === 'string' && rawDid.startsWith('did:') ? rawDid : ''

  // Restrict the preview origin to the configured allowlist (see
  // `allowedPreviewOrigin`) so the callback can only hand the token fragment to a
  // trusted deployment, never an attacker-supplied origin.
  const previewPatterns = String(useRuntimeConfig(event).previewOrigins ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const previewOrigin = allowedPreviewOrigin(getQuery(event).preview, previewPatterns)

  setCookie(event, `oauth_${providerId}`, JSON.stringify({ state, returnTo, did, previewOrigin }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: origin.startsWith('https:'),
    path: '/',
    maxAge: 600
  })

  const authorize = new URL(provider.authorizeUrl)
  authorize.searchParams.set('client_id', credentials.clientId)
  if (!provider.fixedRedirectUri) {
    authorize.searchParams.set('redirect_uri', `${origin}/api/auth/${providerId}/callback`)
  }
  authorize.searchParams.set('response_type', 'code')
  if (provider.scope) authorize.searchParams.set('scope', provider.scope)
  authorize.searchParams.set('state', state)

  return sendRedirect(event, authorize.toString())
})
