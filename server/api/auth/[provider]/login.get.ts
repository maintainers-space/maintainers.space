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
  const claimOwner =
    typeof getQuery(event).claimOwner === 'string' ? String(getQuery(event).claimOwner) : undefined
  const claimName =
    typeof getQuery(event).claimName === 'string' ? String(getQuery(event).claimName) : undefined

  setCookie(
    event,
    `oauth_${providerId}`,
    JSON.stringify({ state, returnTo, did, claimOwner, claimName }),
    {
      httpOnly: true,
      sameSite: 'lax',
      secure: origin.startsWith('https:'),
      path: '/',
      maxAge: 600
    }
  )

  const authorize = new URL(provider.authorizeUrl)
  authorize.searchParams.set('client_id', credentials.clientId)
  if (!provider.omitRedirectUriInAuthorize) {
    authorize.searchParams.set('redirect_uri', `${origin}/api/auth/${providerId}/callback`)
  }
  authorize.searchParams.set('response_type', 'code')
  if (provider.scope) authorize.searchParams.set('scope', provider.scope)
  authorize.searchParams.set('state', state)

  return sendRedirect(event, authorize.toString())
})
