// Client-side half of the Codeberg OAuth flow, mirroring useGitlabAuth.
//
// `connect()` kicks off the server redirect; `completeCallback()` runs on the
// return page to persist the token and record a *verified* forge-account link
// against the user's atproto identity.
interface CodebergUser {
  login: string
  full_name?: string
  avatar_url?: string
  html_url?: string
}

async function fetchAuthedCodebergUser(token: string): Promise<CodebergUser> {
  return await $fetch<CodebergUser>('https://codeberg.org/api/v1/user', {
    headers: { Authorization: `Bearer ${token}` }
  })
}

export function useCodebergAuth() {
  const { get, set, remove } = useForgeTokens()
  const { did, restoring } = useAuth()
  const { link } = useForgeAccounts()

  const isConnected = computed(() => !!get('codeberg'))

  /** Redirect to Codeberg to authorize; returns to `returnTo` (an in-app path). */
  function connect(returnTo?: string): void {
    const to = returnTo ?? (import.meta.client ? location.pathname + location.search : '/settings/accounts')
    const params = new URLSearchParams({ redirect: to })
    if (did.value) params.set('did', did.value)
    window.location.assign(`/api/auth/codeberg/login?${params.toString()}`)
  }

  function disconnect(): void {
    remove('codeberg')
  }

  /** Finalize the redirect: store token, verify identity, persist a linked account. */
  async function completeCallback(): Promise<string> {
    const params = new URLSearchParams(location.hash.slice(1))
    history.replaceState(null, '', location.pathname)

    const error = params.get('error')
    if (error) throw new Error(error)

    const token = params.get('token')
    if (!token) throw new Error('Codeberg did not return a token.')

    set('codeberg', token)

    const user = await fetchAuthedCodebergUser(token)

    const attestation = params.get('attestation') || undefined
    const attestedBy = params.get('attestedBy') || undefined

    while (restoring.value) await new Promise(r => setTimeout(r, 50))
    if (did.value) {
      await link({
        provider: 'codeberg',
        username: user.login,
        host: 'codeberg.org',
        displayName: user.full_name || undefined,
        avatarUrl: user.avatar_url,
        profileUrl: user.html_url,
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
