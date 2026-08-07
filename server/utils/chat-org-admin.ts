export type OrgAdminDenial =
  | 'oauth-app-restricted'
  | 'app-not-installed'
  | 'insufficient-scope'
  | 'bad-token'
  | 'not-a-member'
  | 'not-admin'
  | 'error'

export type OrgAdminOutcome =
  | { result: 'admin' }
  | { result: 'unsupported' }
  | { result: 'denied'; reason: OrgAdminDenial; detail?: string }

const CANONICAL_HOSTS: Record<string, string> = {
  github: 'github.com',
  gitlab: 'gitlab.com',
  bitbucket: 'bitbucket.org'
}

interface GithubMembership {
  state?: string
  role?: string
}

interface GitlabGroup {
  full_path?: string
  path?: string
}

interface BitbucketWorkspacePermissions {
  values?: Array<{ permission?: string; workspace?: { slug?: string } }>
}

interface FetchFailure {
  status?: number
  data?: { message?: string }
  response?: { status?: number; headers?: { get?: (name: string) => string | null } }
}

function failureStatus(e: unknown): number | undefined {
  const f = e as FetchFailure
  return f?.status ?? f?.response?.status
}

function failureMessage(e: unknown): string {
  const f = e as FetchFailure
  return f?.data?.message ?? (e instanceof Error ? e.message : String(e))
}

function grantedScopes(e: unknown): string | null {
  const f = e as FetchFailure
  const header = f?.response?.headers?.get?.('x-oauth-scopes')
  return header === undefined ? null : header
}

async function githubOrgAdmin(owner: string, token: string): Promise<OrgAdminOutcome> {
  try {
    const res = await $fetch.raw<GithubMembership>(
      `https://api.github.com/user/memberships/orgs/${encodeURIComponent(owner)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'maintainers.space'
        }
      }
    )
    const membership = res._data
    if (membership?.state === 'active' && membership.role === 'admin') return { result: 'admin' }
    return {
      result: 'denied',
      reason: 'not-admin',
      detail: `state=${membership?.state} role=${membership?.role} scopes=${res.headers.get('x-oauth-scopes') ?? ''}`
    }
  } catch (e) {
    const status = failureStatus(e)
    const message = failureMessage(e)
    const scopes = grantedScopes(e)

    if (status === 403 && /OAuth App access restrictions/i.test(message)) {
      return { result: 'denied', reason: 'oauth-app-restricted', detail: message }
    }
    if (status === 401) return { result: 'denied', reason: 'bad-token', detail: message }
    if (status === 403 || status === 404) {
      if (scopes === null) {
        return {
          result: 'denied',
          reason: 'app-not-installed',
          detail: `${status} ${message} (no x-oauth-scopes, so a GitHub App token)`
        }
      }
      if (!scopes.split(/,\s*/).includes('read:org')) {
        return { result: 'denied', reason: 'insufficient-scope', detail: `scopes=${scopes}` }
      }
      return { result: 'denied', reason: 'not-a-member', detail: `${status} ${message}` }
    }
    return { result: 'denied', reason: 'error', detail: `${status ?? '?'} ${message}` }
  }
}

async function gitlabGroupOwner(owner: string, token: string): Promise<OrgAdminOutcome> {
  try {
    const groups = await $fetch<GitlabGroup[]>('https://gitlab.com/api/v4/groups', {
      headers: { Authorization: `Bearer ${token}` },
      query: { min_access_level: 50, search: owner, per_page: 100 }
    })
    const wanted = owner.toLowerCase()
    const match = groups.some(
      (g) => g.full_path?.toLowerCase() === wanted || g.path?.toLowerCase() === wanted
    )
    return match ? { result: 'admin' } : { result: 'denied', reason: 'not-admin' }
  } catch (e) {
    const status = failureStatus(e)
    if (status === 401) return { result: 'denied', reason: 'bad-token', detail: failureMessage(e) }
    return { result: 'denied', reason: 'error', detail: `${status ?? '?'} ${failureMessage(e)}` }
  }
}

async function bitbucketWorkspaceOwner(owner: string, token: string): Promise<OrgAdminOutcome> {
  try {
    const res = await $fetch<BitbucketWorkspacePermissions>(
      'https://api.bitbucket.org/2.0/user/permissions/workspaces',
      {
        headers: { Authorization: `Bearer ${token}` },
        query: { q: `workspace.slug="${owner.replace(/"/g, '')}"` }
      }
    )
    const wanted = owner.toLowerCase()
    const match = (res.values ?? []).some(
      (v) => v.workspace?.slug?.toLowerCase() === wanted && v.permission === 'owner'
    )
    return match ? { result: 'admin' } : { result: 'denied', reason: 'not-admin' }
  } catch (e) {
    const status = failureStatus(e)
    if (status === 401) return { result: 'denied', reason: 'bad-token', detail: failureMessage(e) }
    return { result: 'denied', reason: 'error', detail: `${status ?? '?'} ${failureMessage(e)}` }
  }
}

export async function verifyOwnerAdmin(
  provider: string,
  owner: string,
  token: string,
  host?: string
): Promise<OrgAdminOutcome> {
  const canonical = CANONICAL_HOSTS[provider]
  if (!canonical) return { result: 'unsupported' }
  if (host && host.toLowerCase() !== canonical) return { result: 'unsupported' }

  const outcome =
    provider === 'github'
      ? await githubOrgAdmin(owner, token)
      : provider === 'gitlab'
        ? await gitlabGroupOwner(owner, token)
        : provider === 'bitbucket'
          ? await bitbucketWorkspaceOwner(owner, token)
          : ({ result: 'unsupported' } as const)

  if (outcome.result === 'denied') {
    console.warn('[chat] org admin check denied', {
      provider,
      owner,
      reason: outcome.reason,
      detail: outcome.detail
    })
  }
  return outcome
}

export function describeOrgDenial(reason: OrgAdminDenial, provider: string, owner: string): string {
  switch (reason) {
    case 'oauth-app-restricted':
      return `${owner} has OAuth App access restrictions enabled on ${provider}, and maintainers.space isn't approved, so it can't see your role. An organisation owner needs to approve it at https://github.com/organizations/${owner}/settings/oauth_application_policy`
    case 'app-not-installed':
      return `maintainers.space can't see ${owner} on ${provider}. If it's registered as a GitHub App, install it on the organisation and give it the Organization "Members: Read" permission; if it's an OAuth App, an organisation owner needs to approve it.`
    case 'insufficient-scope':
      return `Your ${provider} connection is missing the read:org scope, so your role in ${owner} can't be read. Reconnect your ${provider} account in Settings.`
    case 'bad-token':
      return `Your ${provider} connection is no longer valid. Reconnect it in Settings.`
    case 'not-a-member':
      return `${provider} doesn't report you as a member of ${owner}. If you are, check that maintainers.space is approved for the organisation.`
    case 'not-admin':
      return `You need to be an owner or admin of ${owner} on ${provider} to enable chat for it.`
    case 'error':
      return `Could not check your role in ${owner} on ${provider}. Please try again.`
  }
}
