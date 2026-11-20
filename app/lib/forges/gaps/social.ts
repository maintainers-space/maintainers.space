// GAP(forges): stars, follows and per-user activity feeds are not modelled. They are read through
// `provider.request()` so they still use the package's auth, retries and typed errors.
import type { ForgeProvider } from 'forges'
import { ForgeApiError } from 'forges'

import { EVENT_IMPACT } from '~/lib/activity'
import type { Contribution, ContributionKind } from '~/lib/activity'
import type { RepoCard } from '../view'
import { forgeIdOf } from '../registry'
import { getViewer } from './viewer'

type Loose = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

export interface FollowedAccount {
  avatarUrl?: string
  login: string
  name?: string
}

/** Forges that let an account star a repository. */
export function canStar(provider: ForgeProvider): boolean {
  return ['github', 'gitlab', 'forgejo', 'gitea'].includes(provider.forge)
}

function projectId(owner: string, name: string): string {
  return encodeURIComponent(`${owner}/${name}`)
}

async function status(work: Promise<unknown>): Promise<number> {
  try {
    await work
    return 204
  } catch (error) {
    if (error instanceof ForgeApiError) return error.status
    throw error
  }
}

export async function isStarred(
  provider: ForgeProvider,
  owner: string,
  name: string
): Promise<boolean> {
  if (provider.forge === 'gitlab') {
    const viewer = await getViewer(provider)
    const res = await provider.request<Loose[]>(
      'GET',
      `/projects/${projectId(owner, name)}/starrers`,
      { query: { search: viewer.login } }
    )
    return res.data.some((s) => s.user?.username === viewer.login)
  }
  return (await status(provider.request('GET', `/user/starred/${owner}/${name}`))) === 204
}

export async function setStarred(
  provider: ForgeProvider,
  owner: string,
  name: string,
  starred: boolean
): Promise<number | undefined> {
  if (provider.forge === 'gitlab') {
    try {
      const res = await provider.request<Loose>(
        'POST',
        `/projects/${projectId(owner, name)}/${starred ? 'star' : 'unstar'}`
      )
      return typeof res.data.star_count === 'number' ? res.data.star_count : undefined
    } catch (error) {
      // GitLab answers 304 when the repository is already in the requested state.
      if (error instanceof ForgeApiError && error.status === 304) return undefined
      throw error
    }
  }
  await provider.request(starred ? 'PUT' : 'DELETE', `/user/starred/${owner}/${name}`)
  return undefined
}

export async function listFollowing(
  provider: ForgeProvider,
  limit = 100
): Promise<FollowedAccount[]> {
  const users = await (async () => {
    if (provider.forge === 'gitlab') {
      const viewer = await provider.request<Loose>('GET', '/user')
      return (
        await provider.request<Loose[]>('GET', `/users/${viewer.data.id}/following`, {
          query: { per_page: limit }
        })
      ).data
    }
    const path = '/user/following'
    return (
      await provider.request<Loose[]>('GET', path, {
        query: provider.forge === 'github' ? { per_page: limit } : { limit }
      })
    ).data
  })()
  return users.map((u) => ({
    avatarUrl: u.avatar_url,
    login: u.login ?? u.username,
    name: u.full_name ?? u.name
  }))
}

/** A forge-native repository payload as a persistable card. */
export function rawToRepoCard(provider: ForgeProvider, raw: Loose): RepoCard {
  const gitlab = provider.forge === 'gitlab'
  const fullName: string = gitlab ? raw.path_with_namespace : raw.full_name
  const slash = fullName.lastIndexOf('/')
  return {
    description: raw.description ?? undefined,
    forks: raw.forks_count,
    fullName,
    homepage: raw.homepage ?? raw.website ?? undefined,
    isFork: !!(raw.fork ?? raw.forked_from_project),
    isPrivate: !!(raw.private ?? raw.visibility === 'private'),
    language: raw.language ?? undefined,
    name: fullName.slice(slash + 1),
    owner: fullName.slice(0, slash),
    ownerAvatar: raw.owner?.avatar_url ?? raw.namespace?.avatar_url,
    provider: forgeIdOf(provider),
    stars: raw.stargazers_count ?? raw.stars_count ?? raw.star_count,
    topics: raw.topics ?? [],
    updatedAt: raw.pushed_at ?? raw.updated_at ?? raw.last_activity_at,
    url: raw.html_url ?? raw.web_url ?? ''
  }
}

/** Recent repositories of the accounts the viewer follows. */
export async function listFollowedRepos(provider: ForgeProvider): Promise<RepoCard[]> {
  const following = (await listFollowing(provider)).slice(0, 20)
  const perOwner = await Promise.all(
    following.map(async (user) => {
      try {
        const path =
          provider.forge === 'gitlab'
            ? `/users/${encodeURIComponent(user.login)}/projects`
            : `/users/${encodeURIComponent(user.login)}/repos`
        const query =
          provider.forge === 'github'
            ? { per_page: 5, sort: 'pushed' }
            : provider.forge === 'gitlab'
              ? { order_by: 'last_activity_at', per_page: 5, sort: 'desc' }
              : { limit: 5 }
        const res = await provider.request<Loose[] | { data: Loose[] }>('GET', path, { query })
        const list = Array.isArray(res.data) ? res.data : res.data.data
        return list.map((r) => rawToRepoCard(provider, r)).filter((r) => !r.isFork && !r.isPrivate)
      } catch {
        return [] as RepoCard[]
      }
    })
  )
  return perOwner.flat()
}

function commitLine(message?: string): string {
  return (message ?? '').split('\n')[0] ?? ''
}

/** A person's recent public activity. */
export async function listUserEvents(
  provider: ForgeProvider,
  login: string,
  limit = 100
): Promise<Contribution[]> {
  const id = forgeIdOf(provider)
  switch (provider.forge) {
    case 'github': {
      const res = await provider.request<Loose[]>(
        'GET',
        `/users/${encodeURIComponent(login)}/events`,
        { query: { per_page: Math.min(limit, 100) } }
      )
      return res.data.flatMap((e) => githubEvent(id, e) ?? [])
    }
    case 'gitlab': {
      const user = await provider.request<Loose[]>('GET', '/users', { query: { username: login } })
      const uid = user.data[0]?.id
      if (uid === undefined) return []
      const events = (
        await provider.request<Loose[]>('GET', `/users/${uid}/events`, {
          query: { per_page: Math.min(limit, 100) }
        })
      ).data
      const projects = new Map<number, Loose>()
      await Promise.all(
        [...new Set(events.map((e) => e.project_id).filter(Boolean))]
          .slice(0, 25)
          .map(async (pid) => {
            try {
              projects.set(pid, (await provider.request<Loose>('GET', `/projects/${pid}`)).data)
            } catch {
              /* an event whose project is unreadable is dropped below */
            }
          })
      )
      return events.flatMap((e) => gitlabEvent(id, e, projects) ?? [])
    }
    case 'forgejo':
    case 'gitea': {
      const res = await provider.request<Loose[]>(
        'GET',
        `/users/${encodeURIComponent(login)}/activities/feeds`,
        { query: { limit: Math.min(limit, 100), 'only-performed-by': true } }
      )
      return res.data.flatMap((e) => giteaEvent(id, provider, e) ?? [])
    }
    default:
      return []
  }
}

function githubEvent(provider: string, e: Loose): Contribution | undefined {
  const repoFull = String(e.repo?.name ?? '')
  const [owner = '', name = ''] = repoFull.split('/')
  const login = e.actor?.login
  if (!login || !owner || !name) return undefined
  const p: Loose = e.payload ?? {}
  const web = `https://github.com/${repoFull}`
  const base = {
    actor: { avatarUrl: e.actor.avatar_url, login },
    createdAt: String(e.created_at ?? ''),
    id: String(e.id),
    provider,
    repo: { fullName: repoFull, name, owner, url: web }
  }
  const make = (kind: ContributionKind, extra: Partial<Contribution> = {}): Contribution => ({
    ...base,
    impact: EVENT_IMPACT[kind],
    kind,
    ...extra
  })

  switch (e.type) {
    case 'PushEvent': {
      const commits: Loose[] = Array.isArray(p.commits) ? p.commits : []
      const head = commits.at(-1)
      const sha = p.head ?? head?.sha
      return make('push', {
        commits: commits.toReversed().map((c) => ({
          message: commitLine(c.message),
          sha: c.sha,
          url: c.sha ? `${web}/commit/${c.sha}` : undefined
        })),
        count: p.size ?? (commits.length || undefined),
        title: commitLine(head?.message),
        url: sha
          ? `${web}/commit/${sha}`
          : `${web}/commits/${String(p.ref ?? '').replace('refs/heads/', '')}`
      })
    }
    case 'PullRequestEvent': {
      const kind =
        p.action === 'closed' && p.pull_request?.merged
          ? 'pr_merged'
          : p.action === 'opened' || p.action === 'reopened'
            ? 'pr_opened'
            : 'other'
      return make(kind, {
        number: p.number ?? p.pull_request?.number,
        title: p.pull_request?.title,
        url: p.pull_request?.html_url
      })
    }
    case 'PullRequestReviewEvent':
      return make('pr_review', {
        number: p.pull_request?.number,
        title: p.pull_request?.title,
        url: p.review?.html_url ?? p.pull_request?.html_url
      })
    case 'IssuesEvent': {
      const kind =
        p.action === 'closed'
          ? 'issue_closed'
          : p.action === 'opened' || p.action === 'reopened'
            ? 'issue_opened'
            : 'other'
      return make(kind, { number: p.issue?.number, title: p.issue?.title, url: p.issue?.html_url })
    }
    case 'IssueCommentEvent':
    case 'PullRequestReviewCommentEvent':
    case 'CommitCommentEvent':
      return make('comment', {
        number: p.issue?.number ?? p.pull_request?.number,
        title: p.issue?.title ?? p.pull_request?.title,
        url: p.comment?.html_url
      })
    case 'CreateEvent':
      return make('create', {
        refType: p.ref_type,
        title: p.ref ? `${p.ref_type} ${p.ref}` : p.ref_type,
        url: p.ref && p.ref_type !== 'repository' ? `${web}/tree/${p.ref}` : web
      })
    case 'ReleaseEvent':
      return make('release', {
        title: p.release?.name || p.release?.tag_name,
        url: p.release?.html_url
      })
    case 'ForkEvent':
      return make('fork', { url: p.forkee?.html_url })
    case 'WatchEvent':
      return make('star', { url: web })
    default:
      return undefined
  }
}

function gitlabEvent(
  provider: string,
  e: Loose,
  projects: Map<number, Loose>
): Contribution | undefined {
  const project = projects.get(e.project_id)
  const login = e.author?.username ?? e.author_username
  const fullName: string | undefined = project?.path_with_namespace
  if (!login || !fullName) return undefined
  const slash = fullName.lastIndexOf('/')
  const web: string = project?.web_url ?? `https://gitlab.com/${fullName}`
  const action = String(e.action_name ?? '')
  const target = String(e.target_type ?? '')
  const number: number | undefined = e.target_iid
  let kind: ContributionKind
  let url: string | undefined
  if (e.push_data || action === 'pushed to' || action === 'pushed new') {
    kind = 'push'
    url = e.push_data?.ref ? `${web}/-/commits/${e.push_data.ref}` : web
  } else if (target === 'MergeRequest') {
    kind = action === 'merged' ? 'pr_merged' : action === 'opened' ? 'pr_opened' : 'other'
    url = number ? `${web}/-/merge_requests/${number}` : undefined
  } else if (target === 'Issue') {
    kind = action === 'closed' ? 'issue_closed' : action === 'opened' ? 'issue_opened' : 'other'
    url = number ? `${web}/-/issues/${number}` : undefined
  } else if (target === 'Note' || target === 'DiscussionNote') {
    kind = 'comment'
  } else if (action === 'created' || action === 'joined') {
    kind = 'create'
    url = web
  } else {
    return undefined
  }
  return {
    actor: { avatarUrl: e.author?.avatar_url, login, name: e.author?.name },
    count: e.push_data?.commit_count,
    createdAt: String(e.created_at ?? ''),
    id: String(e.id),
    impact: EVENT_IMPACT[kind],
    kind,
    number,
    provider,
    repo: { fullName, name: fullName.slice(slash + 1), owner: fullName.slice(0, slash), url: web },
    title: e.push_data?.commit_title ?? e.target_title,
    url
  }
}

const GITEA_KINDS: Record<string, ContributionKind> = {
  commit_repo: 'push',
  create_issue: 'issue_opened',
  close_issue: 'issue_closed',
  create_pull_request: 'pr_opened',
  merge_pull_request: 'pr_merged',
  auto_merge_pull_request: 'pr_merged',
  approve_pull_request: 'pr_review',
  reject_pull_request: 'pr_review',
  comment_issue: 'comment',
  comment_pull: 'comment',
  create_repo: 'create',
  push_tag: 'create',
  publish_release: 'release',
  star_repo: 'star'
}

function giteaEvent(provider: string, forge: ForgeProvider, e: Loose): Contribution | undefined {
  const login = e.act_user?.login ?? e.act_user?.username
  const fullName: string | undefined = e.repo?.full_name
  if (!login || !fullName) return undefined
  const slash = fullName.lastIndexOf('/')
  const web: string = e.repo.html_url ?? `${forge.baseUrl.replace(/\/api\/v1$/, '')}/${fullName}`
  const kind = GITEA_KINDS[String(e.op_type)] ?? 'other'
  return {
    actor: { avatarUrl: e.act_user.avatar_url, login, name: e.act_user.full_name },
    createdAt: String(e.created ?? e.created_at ?? ''),
    id: String(e.id ?? `${e.op_type}-${e.created}`),
    impact: EVENT_IMPACT[kind],
    kind,
    provider,
    refType: e.ref_name ? 'ref' : undefined,
    repo: { fullName, name: fullName.slice(slash + 1), owner: fullName.slice(0, slash), url: web },
    title: e.ref_name ? String(e.ref_name) : commitLine(e.content),
    url: e.ref_name ? `${web}/src/branch/${encodeURIComponent(String(e.ref_name))}` : web
  }
}
