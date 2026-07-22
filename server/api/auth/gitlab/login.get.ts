// GitLab OAuth — step 1: redirect the browser to GitLab's consent screen.
//
// Mirrors the GitHub flow: linking a GitLab account is verified through OAuth
// (no personal access tokens), and the client secret never leaves the server.
// The `api` scope is requested because koinon offers full parity with GitHub —
// reading repos/issues/MRs, the Todos inbox, approving & merging MRs and posting
// comments all require it.
const GITLAB_SCOPE = 'api'

function safeReturn(raw: unknown): string {
  const value = typeof raw === 'string' ? raw : ''
  return value.startsWith('/') && !value.startsWith('//') ? value : '/settings/accounts'
}

export default defineEventHandler((event) => {
  const { clientId } = useRuntimeConfig(event).gitlab
  if (!clientId) {
    throw createError({ statusCode: 501, statusMessage: 'GitLab OAuth is not configured on this server.' })
  }

  const origin = getRequestURL(event).origin
  const state = crypto.randomUUID()
  const returnTo = safeReturn(getQuery(event).redirect)
  const rawDid = getQuery(event).did
  const did = typeof rawDid === 'string' && rawDid.startsWith('did:') ? rawDid : ''

  setCookie(event, 'gl_oauth', JSON.stringify({ state, returnTo, did }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: origin.startsWith('https:'),
    path: '/',
    maxAge: 600
  })

  const authorize = new URL('https://gitlab.com/oauth/authorize')
  authorize.searchParams.set('client_id', clientId)
  authorize.searchParams.set('redirect_uri', `${origin}/api/auth/gitlab/callback`)
  authorize.searchParams.set('response_type', 'code')
  authorize.searchParams.set('scope', GITLAB_SCOPE)
  authorize.searchParams.set('state', state)

  return sendRedirect(event, authorize.toString())
})
