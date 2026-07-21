// GitHub OAuth — step 1: redirect the browser to GitHub's consent screen.
//
// The whole point is *verification*: linking a GitHub account requires proving
// ownership through OAuth rather than typing a username, and no personal access
// tokens are needed. The client secret never leaves the server.
const GITHUB_SCOPE = 'read:user read:org notifications public_repo'

function safeReturn(raw: unknown): string {
  const value = typeof raw === 'string' ? raw : ''
  // Only allow same-app absolute paths (avoid open redirects).
  return value.startsWith('/') && !value.startsWith('//') ? value : '/settings/accounts'
}

export default defineEventHandler((event) => {
  const { clientId } = useRuntimeConfig(event).github
  if (!clientId) {
    throw createError({ statusCode: 501, statusMessage: 'GitHub OAuth is not configured on this server.' })
  }

  const origin = getRequestURL(event).origin
  const state = crypto.randomUUID()
  const returnTo = safeReturn(getQuery(event).redirect)

  setCookie(event, 'gh_oauth', JSON.stringify({ state, returnTo }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: origin.startsWith('https:'),
    path: '/',
    maxAge: 600
  })

  const authorize = new URL('https://github.com/login/oauth/authorize')
  authorize.searchParams.set('client_id', clientId)
  authorize.searchParams.set('redirect_uri', `${origin}/api/auth/github/callback`)
  authorize.searchParams.set('scope', GITHUB_SCOPE)
  authorize.searchParams.set('state', state)

  return sendRedirect(event, authorize.toString())
})
