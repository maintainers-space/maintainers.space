import type { H3Event } from 'h3'

// Per-forge OAuth2 config, driving the generic login/callback routes at
// server/api/auth/[provider]/{login,callback}.get.ts. Each forge is otherwise
// a standard authorization-code flow; only a handful of things vary — the
// endpoints, the scope (or lack of one), how the token request authenticates,
// and how to fetch the connecting user's username to attest identity.

export interface OAuthProviderConfig {
  label: string
  authorizeUrl: string
  tokenUrl: string
  scope?: string
  /** Most forges accept client id/secret in the token POST body; some require HTTP Basic auth instead. */
  tokenAuthStyle?: 'basic'
  /** Set when the forge's OAuth app has a redirect URI fixed at registration time and rejects one on the authorize *and* token requests. */
  fixedRedirectUri?: boolean
  /** Fetch the connecting user's forge username with the freshly-issued token, to bind a signed attestation. */
  fetchUsername: (token: string) => Promise<string>
  /** Recorded on the linked-account record for disambiguation. Omit only where adding one would change an already-shipped record key. */
  host?: string
}

async function fetchUsernameRest(
  url: string,
  token: string,
  usernameField: 'login' | 'username',
  extraHeaders?: Record<string, string>
): Promise<string> {
  const user = await $fetch<Record<string, unknown>>(url, {
    headers: { Authorization: `Bearer ${token}`, ...extraHeaders }
  })
  return String(user[usernameField] ?? '')
}

export const oauthProviders: Record<string, OAuthProviderConfig> = {
  github: {
    label: 'GitHub',
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    // GitHub OAuth Apps don't have a scope picker at creation time; requested here instead.
    scope: 'read:user read:org notifications public_repo',
    fetchUsername: (token) =>
      fetchUsernameRest('https://api.github.com/user', token, 'login', {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'maintainers.space'
      })
    // No `host`: preserves the record key existing linked GitHub accounts already use.
  },
  gitlab: {
    label: 'GitLab',
    authorizeUrl: 'https://gitlab.com/oauth/authorize',
    tokenUrl: 'https://gitlab.com/oauth/token',
    // Full parity with the GitHub integration needs `api`: repos/issues/MRs, the
    // Todos inbox, and approving/merging/commenting on MRs all require it.
    scope: 'api',
    host: 'gitlab.com',
    fetchUsername: (token) => fetchUsernameRest('https://gitlab.com/api/v4/user', token, 'username')
  },
  codeberg: {
    label: 'Codeberg',
    authorizeUrl: 'https://codeberg.org/login/oauth/authorize',
    tokenUrl: 'https://codeberg.org/login/oauth/access_token',
    // Forgejo OAuth2 tokens are unscoped — no scope picker, full account access.
    host: 'codeberg.org',
    fetchUsername: (token) => fetchUsernameRest('https://codeberg.org/api/v1/user', token, 'login')
  },
  gitea: {
    label: 'Gitea',
    authorizeUrl: 'https://gitea.com/login/oauth/authorize',
    tokenUrl: 'https://gitea.com/login/oauth/access_token',
    host: 'gitea.com',
    fetchUsername: (token) => fetchUsernameRest('https://gitea.com/api/v1/user', token, 'login')
  },
  bitbucket: {
    label: 'Bitbucket',
    authorizeUrl: 'https://bitbucket.org/site/oauth2/authorize',
    tokenUrl: 'https://bitbucket.org/site/oauth2/access_token',
    // account: read profile; repository: read repos; pullrequest:write: read/write
    // + merge PRs. No `issue*` scope — Bitbucket's issue tracker isn't integrated.
    scope: 'account repository pullrequest:write',
    tokenAuthStyle: 'basic',
    host: 'bitbucket.org',
    fetchUsername: async (token) => {
      // Bitbucket dropped stable usernames in 2019 (GDPR); nickname is the
      // closest remaining handle, falling back to the account UUID.
      const user = await $fetch<{ nickname?: string; uuid?: string }>(
        'https://api.bitbucket.org/2.0/user',
        { headers: { Authorization: `Bearer ${token}` } }
      )
      return user.nickname ?? user.uuid ?? ''
    }
  }
}

export function getOAuthProvider(id: string): OAuthProviderConfig | undefined {
  return oauthProviders[id]
}

/**
 * Every forge's OAuth client id/secret lives in `runtimeConfig[id]` (declared
 * per-provider in nuxt.config.ts), keyed identically to its `oauthProviders`
 * entry — look it up generically rather than switching on the provider id.
 */
export function getOAuthCredentials(
  event: H3Event,
  id: string
): { clientId: string; clientSecret: string } | null {
  const config = useRuntimeConfig(event) as unknown as Record<
    string,
    { clientId?: string; clientSecret?: string } | undefined
  >
  const entry = config[id]
  if (!entry?.clientId || !entry.clientSecret) return null
  return { clientId: entry.clientId, clientSecret: entry.clientSecret }
}
