// Codeberg OAuth — step 1: redirect the browser to Codeberg's consent screen.
//
// Codeberg runs Forgejo, whose OAuth2 tokens are unscoped (full user access), so
// unlike GitLab there is no scope to request. The client secret stays on the
// server; the flow otherwise mirrors the GitHub and GitLab redirects.
function safeReturn(raw: unknown): string {
  const value = typeof raw === 'string' ? raw : ''
  return value.startsWith('/') && !value.startsWith('//') ? value : '/settings/accounts'
}

export default defineEventHandler((event) => {
  const { clientId } = useRuntimeConfig(event).codeberg
  if (!clientId) {
    throw createError({
      statusCode: 501,
      statusMessage: 'Codeberg OAuth is not configured on this server.'
    })
  }

  const origin = getRequestURL(event).origin
  const state = crypto.randomUUID()
  const returnTo = safeReturn(getQuery(event).redirect)
  const rawDid = getQuery(event).did
  const did = typeof rawDid === 'string' && rawDid.startsWith('did:') ? rawDid : ''
  const claimOwner =
    typeof getQuery(event).claimOwner === 'string' ? String(getQuery(event).claimOwner) : undefined
  const claimName =
    typeof getQuery(event).claimName === 'string' ? String(getQuery(event).claimName) : undefined

  setCookie(event, 'cb_oauth', JSON.stringify({ state, returnTo, did, claimOwner, claimName }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: origin.startsWith('https:'),
    path: '/',
    maxAge: 600
  })

  const authorize = new URL('https://codeberg.org/login/oauth/authorize')
  authorize.searchParams.set('client_id', clientId)
  authorize.searchParams.set('redirect_uri', `${origin}/api/auth/codeberg/callback`)
  authorize.searchParams.set('response_type', 'code')
  authorize.searchParams.set('state', state)

  return sendRedirect(event, authorize.toString())
})
