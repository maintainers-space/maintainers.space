// Client-side half of the GitHub OAuth flow.
//
// `connect()` kicks off the server redirect; `completeCallback()` runs on the
// return page to persist the token and record a *verified* forge-account link
// against the user's atproto identity.
interface GithubUser {
  login: string
  name?: string
  avatar_url?: string
  html_url?: string
}

async function fetchAuthedGithubUser(token: string): Promise<GithubUser> {
  return await $fetch<GithubUser>('https://api.github.com/user', {
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}` }
  })
}

export function useGithubAuth() {
  const { get, set, remove } = useForgeTokens()
  const { did, restoring } = useAuth()
  const { link } = useForgeAccounts()

  const isConnected = computed(() => !!get('github'))

  /** Redirect to GitHub to authorize; returns to `returnTo` (an in-app path). */
  function connect(returnTo?: string): void {
    const to = returnTo ?? (import.meta.client ? location.pathname + location.search : '/settings/accounts')
    window.location.assign(`/api/auth/github/login?redirect=${encodeURIComponent(to)}`)
  }

  function disconnect(): void {
    remove('github')
  }

  /** Finalize the redirect: store token, verify identity, persist a linked account. */
  async function completeCallback(): Promise<string> {
    const params = new URLSearchParams(location.hash.slice(1))
    history.replaceState(null, '', location.pathname)

    const error = params.get('error')
    if (error) throw new Error(error)

    const token = params.get('token')
    if (!token) throw new Error('GitHub did not return a token.')

    set('github', token)

    // Verify who the token belongs to, then link it as a verified account.
    const user = await fetchAuthedGithubUser(token)

    // The link record lives on the atproto PDS, so wait for session restore.
    while (restoring.value) await new Promise(r => setTimeout(r, 50))
    if (did.value) {
      await link({
        provider: 'github',
        username: user.login,
        displayName: user.name || undefined,
        avatarUrl: user.avatar_url,
        profileUrl: user.html_url,
        verified: true
      }).catch(() => { /* token is stored regardless; linking is best-effort */ })
    }

    const returnTo = params.get('return')
    return returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/settings/accounts'
  }

  return { isConnected, connect, disconnect, completeCallback }
}
