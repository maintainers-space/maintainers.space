import type { ForgeId } from '~/types/forge'

/** What we need out of a forge's "who am I" endpoint to link a verified account. */
export interface ForgeAuthUser {
  username: string
  displayName?: string
  avatarUrl?: string
  profileUrl?: string
}

interface GithubUser {
  login: string
  name?: string
  avatar_url?: string
  html_url?: string
}

async function fetchAuthedGithubUser(token: string): Promise<ForgeAuthUser> {
  const u = await $fetch<GithubUser>('https://api.github.com/user', {
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}` }
  })
  return { username: u.login, displayName: u.name, avatarUrl: u.avatar_url, profileUrl: u.html_url }
}

interface GitlabUser {
  username: string
  name?: string
  avatar_url?: string
  web_url?: string
}

async function fetchAuthedGitlabUser(token: string): Promise<ForgeAuthUser> {
  const u = await $fetch<GitlabUser>('https://gitlab.com/api/v4/user', {
    headers: { Authorization: `Bearer ${token}` }
  })
  return {
    username: u.username,
    displayName: u.name,
    avatarUrl: u.avatar_url,
    profileUrl: u.web_url
  }
}

interface CodebergUser {
  login: string
  full_name?: string
  avatar_url?: string
  html_url?: string
}

async function fetchAuthedCodebergUser(token: string): Promise<ForgeAuthUser> {
  const u = await $fetch<CodebergUser>('https://codeberg.org/api/v1/user', {
    headers: { Authorization: `Bearer ${token}` }
  })
  return {
    username: u.login,
    displayName: u.full_name,
    avatarUrl: u.avatar_url,
    profileUrl: u.html_url
  }
}

interface GiteaUser {
  login: string
  full_name?: string
  avatar_url?: string
  html_url?: string
}

async function fetchAuthedGiteaUser(token: string): Promise<ForgeAuthUser> {
  const u = await $fetch<GiteaUser>('https://gitea.com/api/v1/user', {
    headers: { Authorization: `Bearer ${token}` }
  })
  return {
    username: u.login,
    displayName: u.full_name,
    avatarUrl: u.avatar_url,
    profileUrl: u.html_url
  }
}

interface BitbucketUser {
  nickname?: string
  uuid?: string
  display_name?: string
  links?: { avatar?: { href?: string }; html?: { href?: string } }
}

async function fetchAuthedBitbucketUser(token: string): Promise<ForgeAuthUser> {
  const u = await $fetch<BitbucketUser>('https://api.bitbucket.org/2.0/user', {
    headers: { Authorization: `Bearer ${token}` }
  })
  return {
    username: u.nickname ?? u.uuid ?? '',
    displayName: u.display_name,
    avatarUrl: u.links?.avatar?.href,
    profileUrl: u.links?.html?.href
  }
}

interface SourcehutMeResponse {
  data?: { me?: { canonicalName?: string; email?: string } }
}

async function fetchAuthedSourcehutUser(token: string): Promise<ForgeAuthUser> {
  const res = await $fetch<SourcehutMeResponse>('https://meta.sr.ht/query', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: { query: '{ me { canonicalName email } }' }
  })
  const username = (res.data?.me?.canonicalName ?? '').replace(/^~/, '')
  return { username, profileUrl: username ? `https://git.sr.ht/~${username}` : undefined }
}

interface ForgeAuthClientConfig {
  /** Recorded on the linked-account record for disambiguation (see useForgeAccounts). */
  host?: string
  fetchUser: (token: string) => Promise<ForgeAuthUser>
}

// Client-side half of each forge's OAuth flow (server side: server/utils/oauth-providers.ts).
const FORGE_AUTH_CLIENTS: Partial<Record<ForgeId, ForgeAuthClientConfig>> = {
  github: { fetchUser: fetchAuthedGithubUser },
  gitlab: { host: 'gitlab.com', fetchUser: fetchAuthedGitlabUser },
  codeberg: { host: 'codeberg.org', fetchUser: fetchAuthedCodebergUser },
  gitea: { host: 'gitea.com', fetchUser: fetchAuthedGiteaUser },
  bitbucket: { host: 'bitbucket.org', fetchUser: fetchAuthedBitbucketUser },
  sourcehut: { host: 'sr.ht', fetchUser: fetchAuthedSourcehutUser }
}

/**
 * One OAuth client for every forge: `connect()` kicks off the server redirect;
 * `completeCallback()` runs on the return page to persist the token and record
 * a *verified* forge-account link against the user's atproto identity.
 */
export function useForgeAuth(providerId: ForgeId) {
  const client = FORGE_AUTH_CLIENTS[providerId]
  if (!client) {
    throw new Error(`No OAuth client configured for forge "${providerId}".`)
  }
  const { fetchUser, host } = client

  const { get, set, remove } = useForgeTokens()
  const { did, restoring } = useAuth()
  const { link } = useForgeAccounts()
  const { finishClaim } = useRepoMetadataEditor()
  const toast = useToast()

  const isConnected = computed(() => !!get(providerId))

  /** Redirect to the forge to authorize; returns to `returnTo` (an in-app path). */
  function connect(returnTo?: string): void {
    const to =
      returnTo ?? (import.meta.client ? location.pathname + location.search : '/settings/accounts')
    const params = new URLSearchParams({ redirect: to })
    // Bind the attestation to the signed-in atproto identity when available.
    if (did.value) params.set('did', did.value)
    window.location.assign(`/api/auth/${providerId}/login?${params.toString()}`)
  }

  function disconnect(): void {
    remove(providerId)
  }

  /** Finalize the redirect: store token, verify identity, persist a linked account. */
  async function completeCallback(): Promise<string> {
    const params = new URLSearchParams(location.hash.slice(1))
    history.replaceState(null, '', location.pathname)

    const error = params.get('error')
    if (error) throw new Error(error)

    const token = params.get('token')
    if (!token) throw new Error(`${providerId} did not return a token.`)

    set(providerId, token)

    // Verify who the token belongs to, then link it as a verified account.
    const user = await fetchUser(token)

    // Unforgeable proof (signed by our server) that this forge account belongs
    // to the current DID. Absent when the server has no signing key configured.
    const attestation = params.get('attestation') || undefined
    const attestedBy = params.get('attestedBy') || undefined

    // The link record lives on the atproto PDS, so wait for session restore.
    while (restoring.value) await new Promise((r) => setTimeout(r, 50))
    if (did.value) {
      await link({
        provider: providerId,
        username: user.username,
        host,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        profileUrl: user.profileUrl,
        verified: true,
        attestation,
        attestedBy
      }).catch((linkError) => {
        toast.add({
          title: 'Connected, but could not link to your profile',
          description: linkError instanceof Error ? linkError.message : String(linkError),
          color: 'error',
          icon: 'i-lucide-circle-alert'
        })
      })
    }

    await finishClaim(providerId, params)

    const returnTo = params.get('return')
    return returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')
      ? returnTo
      : '/settings/accounts'
  }

  return { isConnected, connect, disconnect, completeCallback }
}
