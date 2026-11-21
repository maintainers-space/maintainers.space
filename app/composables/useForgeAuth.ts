import { createAppProvider } from '~/lib/forges/providers'
import { getViewer } from '~/lib/forges/gaps/viewer'
import { getForge } from '~/lib/forges/registry'

/** What we need out of a forge's "who am I" endpoint to link a verified account. */
export interface ForgeAuthUser {
  username: string
  displayName?: string
  avatarUrl?: string
  profileUrl?: string
}

/** Reads the account a freshly issued token belongs to, through a provider built just for it. */
async function fetchAuthedUser(providerId: string, token: string): Promise<ForgeAuthUser> {
  const descriptor = getForge(providerId)
  if (!descriptor) throw new Error(`Unknown forge "${providerId}".`)
  const provider = createAppProvider(descriptor, { tokens: { [providerId]: token } })
  const viewer = await getViewer(provider)
  return {
    avatarUrl: viewer.avatarUrl,
    displayName: viewer.name,
    profileUrl: viewer.url,
    username: viewer.login
  }
}

interface ForgeAuthClientConfig {
  /** Recorded on the linked-account record for disambiguation (see useForgeAccounts). */
  host?: string
}

// Client-side half of each forge's OAuth flow (server side: server/utils/oauth-providers.ts).
const FORGE_AUTH_CLIENTS: Record<string, ForgeAuthClientConfig> = {
  github: {},
  gitlab: { host: 'gitlab.com' },
  codeberg: { host: 'codeberg.org' },
  gitea: { host: 'gitea.com' },
  bitbucket: { host: 'bitbucket.org' }
}

/**
 * One OAuth client for every forge: `connect()` kicks off the server redirect;
 * `completeCallback()` runs on the return page to persist the token and record
 * a *verified* forge-account link against the user's atproto identity.
 */
export function useForgeAuth(providerId: string) {
  const client = FORGE_AUTH_CLIENTS[providerId]
  if (!client) {
    throw new Error(`No OAuth client configured for forge "${providerId}".`)
  }
  const { host } = client

  const { get, set, remove } = useForgeTokens()
  const { did, restoring } = useAuth()
  const { link } = useForgeAccounts()
  const toast = useToast()

  const isConnected = computed(() => !!get(providerId))

  /** Redirect to the forge to authorize; returns to `returnTo` (an in-app path). */
  function connect(returnTo?: string): void {
    const to =
      returnTo ?? (import.meta.client ? location.pathname + location.search : '/settings/accounts')
    const params = new URLSearchParams({ redirect: to })

    // If we're on a deployment preview, we must route the OAuth flow through the production domain
    // because the OAuth app only whitelists the production callback URL.
    if (
      import.meta.client &&
      location.hostname !== 'localhost' &&
      location.hostname !== '127.0.0.1' &&
      location.hostname !== 'maintainers.space'
    ) {
      params.set('preview', location.origin)
    }

    // Bind the attestation to the signed-in atproto identity when available.
    if (did.value) params.set('did', did.value)

    const baseAuthUrl = params.has('preview') ? 'https://maintainers.space' : ''
    window.location.assign(`${baseAuthUrl}/api/auth/${providerId}/login?${params.toString()}`)
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
    const user = await fetchAuthedUser(providerId, token)

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

    const returnTo = params.get('return')
    return returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')
      ? returnTo
      : '/settings/accounts'
  }

  return { isConnected, connect, disconnect, completeCallback }
}
