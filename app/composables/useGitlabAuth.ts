// Client-side half of the GitLab OAuth flow, mirroring useGithubAuth.
//
// `connect()` kicks off the server redirect; `completeCallback()` runs on the
// return page to persist the token and record a *verified* forge-account link
// against the user's atproto identity.
interface GitlabUser {
  username: string
  name?: string
  avatar_url?: string
  web_url?: string
}

async function fetchAuthedGitlabUser(token: string): Promise<GitlabUser> {
  return await $fetch<GitlabUser>('https://gitlab.com/api/v4/user', {
    headers: { Authorization: `Bearer ${token}` }
  })
}

export function useGitlabAuth() {
  const { get, set, remove } = useForgeTokens()
  const { did, restoring } = useAuth()
  const { link } = useForgeAccounts()

  const isConnected = computed(() => !!get('gitlab'))

  /** Redirect to GitLab to authorize; returns to `returnTo` (an in-app path). */
  function connect(returnTo?: string): void {
    const to = returnTo ?? (import.meta.client ? location.pathname + location.search : '/settings/accounts')
    const params = new URLSearchParams({ redirect: to })
    if (did.value) params.set('did', did.value)
    window.location.assign(`/api/auth/gitlab/login?${params.toString()}`)
  }

  function disconnect(): void {
    remove('gitlab')
  }

  /** Finalize the redirect: store token, verify identity, persist a linked account. */
  async function completeCallback(): Promise<string> {
    const params = new URLSearchParams(location.hash.slice(1))
    history.replaceState(null, '', location.pathname)

    const error = params.get('error')
    if (error) throw new Error(error)

    const token = params.get('token')
    if (!token) throw new Error('GitLab did not return a token.')

    set('gitlab', token)

    const user = await fetchAuthedGitlabUser(token)

    const attestation = params.get('attestation') || undefined
    const attestedBy = params.get('attestedBy') || undefined

    while (restoring.value) await new Promise(r => setTimeout(r, 50))
    if (did.value) {
      await link({
        provider: 'gitlab',
        username: user.username,
        host: 'gitlab.com',
        displayName: user.name || undefined,
        avatarUrl: user.avatar_url,
        profileUrl: user.web_url,
        verified: true,
        attestation,
        attestedBy
      }).catch(() => { /* token is stored regardless; linking is best-effort */ })
    }

    const returnTo = params.get('return')
    return returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/settings/accounts'
  }

  return { isConnected, connect, disconnect, completeCallback }
}
