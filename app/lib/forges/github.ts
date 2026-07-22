/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  ForgeActionJob,
  ForgeActionRun,
  ForgeBranch,
  ForgeBlob,
  ForgeCommit,
  ForgeCommitActor,
  ForgeCommitDetail,
  ForgeComment,
  ForgeContribution,
  ForgeDiscussion,
  ForgeDiscussionDetail,
  ForgeEventKind,
  ForgeFileDiff,
  ForgeIssue,
  ForgeIssueDetail,
  ForgeNotification,
  ForgePull,
  ForgePullDetail,
  ForgePullState,
  ForgeProvider,
  ForgeReadOptions,
  ForgeRepo,
  ForgeRunStatus,
  ForgeSearchCode,
  ForgeSearchOptions,
  ForgeTreeEntry,
  ForgeUser,
  Paginated
} from '~/types/forge'

import { getForgeToken } from '~/lib/forges/token-store'

const API = 'https://api.github.com'

function ghHeaders(opts?: ForgeReadOptions, accept = 'application/vnd.github+json'): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept': accept,
    'X-GitHub-Api-Version': '2022-11-28'
  }
  const token = opts?.token ?? getForgeToken('github')
  if (token) headers.Authorization = 'Bearer ' + token
  return headers
}

async function ghGraphql<T>(query: string, variables: Record<string, unknown>, opts?: ForgeReadOptions): Promise<T> {
  const res = await $fetch<{ data?: T, errors?: { message: string }[] }>(`${API}/graphql`, {
    method: 'POST',
    headers: ghHeaders(opts),
    body: { query, variables },
    signal: opts?.signal
  })
  if (res.errors?.length) throw createError({ statusCode: 400, statusMessage: res.errors[0]?.message ?? 'GraphQL error' })
  return res.data as T
}

function mapDiscussion(d: any): ForgeDiscussion {
  return {
    provider: 'github',
    id: String(d.number),
    number: d.number,
    title: d.title,
    category: d.category?.name ?? null,
    author: d.author ? { provider: 'github', login: d.author.login, avatarUrl: d.author.avatarUrl, url: d.author.url } : undefined,
    commentCount: d.comments?.totalCount,
    createdAt: d.createdAt,
    url: d.url,
    answered: !!d.answerChosenAt
  }
}

function decodeBase64Utf8(b64: string): string {
  const binary = atob(b64.replace(/\s/g, ''))
  const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function looksBinary(b64: string): boolean {
  try {
    const sample = atob(b64.replace(/\s/g, '').slice(0, 512))
    for (let i = 0; i < sample.length; i++) {
      const c = sample.charCodeAt(i)
      if (c === 0) return true
    }
    return false
  } catch {
    return false
  }
}

function sortEntries(a: ForgeTreeEntry, b: ForgeTreeEntry): number {
  if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
  return a.name.localeCompare(b.name)
}

function mapUser(u: any): ForgeUser | undefined {
  if (!u) return undefined
  return {
    provider: 'github',
    login: u.login ?? '',
    avatarUrl: u.avatar_url ?? null,
    url: u.html_url ?? null
  }
}

function mapCommitActor(gitActor: any, ghUser: any): ForgeCommitActor | undefined {
  if (!gitActor && !ghUser) return undefined
  return {
    name: gitActor?.name,
    email: gitActor?.email,
    when: gitActor?.date,
    login: ghUser?.login,
    avatarUrl: ghUser?.avatar_url ?? null
  }
}

function mapRepo(r: any): ForgeRepo {
  return {
    provider: 'github',
    owner: r.owner?.login ?? '',
    name: r.name,
    fullName: r.full_name ?? `${r.owner?.login ?? ''}/${r.name}`,
    description: r.description ?? null,
    defaultBranch: r.default_branch || 'main',
    url: r.html_url,
    ownerUrl: r.owner?.html_url,
    ownerAvatar: r.owner?.avatar_url ?? null,
    homepage: r.homepage || null,
    language: r.language ?? null,
    topics: r.topics ?? [],
    stars: r.stargazers_count,
    forks: r.forks_count,
    watchers: r.subscribers_count ?? r.watchers_count,
    issues: r.open_issues_count,
    isPrivate: r.private,
    isFork: r.fork,
    license: r.license?.spdx_id ?? null,
    createdAt: r.created_at ?? null,
    updatedAt: r.pushed_at ?? r.updated_at ?? null
  }
}

function mapIssue(r: any): ForgeIssue {
  return {
    provider: 'github',
    id: String(r.number),
    number: r.number,
    title: r.title,
    state: r.state === 'closed' ? 'closed' : 'open',
    author: mapUser(r.user),
    body: r.body ?? null,
    commentCount: r.comments,
    labels: (r.labels ?? []).map((l: any) => (typeof l === 'string' ? { name: l } : { name: l.name, color: l.color, description: l.description })),
    createdAt: r.created_at ?? null,
    updatedAt: r.updated_at ?? null,
    closedAt: r.closed_at ?? null,
    url: r.html_url,
    isPull: !!r.pull_request
  }
}

function pullState(r: any): ForgePullState {
  if (r.merged_at || r.merged) return 'merged'
  if (r.state === 'closed') return 'closed'
  if (r.draft) return 'draft'
  return 'open'
}

function mapPull(r: any): ForgePull {
  return {
    provider: 'github',
    id: String(r.number),
    number: r.number,
    title: r.title,
    state: pullState(r),
    author: mapUser(r.user),
    body: r.body ?? null,
    commentCount: r.comments,
    labels: (r.labels ?? []).map((l: any) => ({ name: l.name, color: l.color })),
    sourceBranch: r.head?.ref,
    targetBranch: r.base?.ref,
    createdAt: r.created_at ?? null,
    updatedAt: r.updated_at ?? null,
    mergedAt: r.merged_at ?? null,
    closedAt: r.closed_at ?? null,
    url: r.html_url
  }
}

function mapComment(r: any): ForgeComment {
  return {
    id: String(r.id),
    author: mapUser(r.user),
    body: r.body ?? '',
    createdAt: r.created_at ?? null,
    url: r.html_url
  }
}

function mapCommit(r: any): ForgeCommit {
  const sha: string = r.sha
  return {
    sha,
    shortSha: sha ? sha.slice(0, 7) : '',
    message: r.commit?.message ?? '',
    author: mapCommitActor(r.commit?.author, r.author),
    committer: mapCommitActor(r.commit?.committer, r.committer),
    url: r.html_url,
    parents: (r.parents ?? []).map((p: any) => p.sha)
  }
}

function mapFileDiff(f: any): ForgeFileDiff {
  const status: ForgeFileDiff['status']
    = f.status === 'added'
      ? 'added'
      : f.status === 'removed'
        ? 'removed'
        : f.status === 'renamed'
          ? 'renamed'
          : f.status === 'copied'
            ? 'copied'
            : f.status === 'changed'
              ? 'changed'
              : 'modified'
  return {
    oldPath: f.previous_filename,
    path: f.filename,
    status,
    additions: f.additions,
    deletions: f.deletions,
    isBinary: f.patch == null && f.changes === 0,
    patch: f.patch ?? null
  }
}

function ghRunStatus(status: string | null, conclusion: string | null): ForgeRunStatus {
  if (status && status !== 'completed') return status === 'queued' || status === 'waiting' || status === 'pending' ? 'queued' : 'running'
  switch (conclusion) {
    case 'success': return 'success'
    case 'failure': return 'failure'
    case 'cancelled': return 'cancelled'
    case 'skipped': return 'skipped'
    case 'timed_out': return 'timed_out'
    default: return 'unknown'
  }
}

function mapRun(r: any): ForgeActionRun {
  return {
    provider: 'github',
    id: String(r.id),
    name: r.name || r.display_title || `Run #${r.run_number}`,
    status: ghRunStatus(r.status, r.conclusion),
    event: r.event,
    branch: r.head_branch,
    commitSha: r.head_sha,
    commitMessage: r.head_commit?.message,
    actor: mapUser(r.actor),
    createdAt: r.created_at ?? null,
    updatedAt: r.updated_at ?? null,
    url: r.html_url
  }
}

function mapJob(j: any): ForgeActionJob {
  return {
    id: String(j.id),
    name: j.name,
    status: ghRunStatus(j.status, j.conclusion),
    startedAt: j.started_at ?? null,
    completedAt: j.completed_at ?? null,
    url: j.html_url,
    steps: (j.steps ?? []).map((s: any) => ({ name: s.name, number: s.number, status: ghRunStatus(s.status, s.conclusion) }))
  }
}

async function getRootTree(owner: string, repo: string, opts?: ForgeReadOptions): Promise<ForgeTreeEntry[]> {
  const data = await $fetch<any>(`${API}/repos/${owner}/${repo}/contents`, { headers: ghHeaders(opts), signal: opts?.signal })
  const arr = Array.isArray(data) ? data : [data]
  return arr
    .map((e: any): ForgeTreeEntry => ({ name: e.name, path: e.path, type: e.type === 'dir' ? 'dir' : 'file', size: e.size, sha: e.sha }))
    .sort(sortEntries)
}

async function getReadme(owner: string, repo: string, ref?: string, opts?: ForgeReadOptions) {
  try {
    const r = await $fetch<any>(`${API}/repos/${owner}/${repo}/readme`, {
      headers: ghHeaders(opts),
      query: ref ? { ref } : undefined,
      signal: opts?.signal
    })
    return { filename: r.name as string, content: decodeBase64Utf8(r.content) }
  } catch {
    return null
  }
}

/** Relative "impact" weight per event kind, used to rank the friends feed. */
const EVENT_IMPACT: Record<ForgeEventKind, number> = {
  pr_merged: 10,
  release: 8,
  pr_opened: 6,
  pr_review: 4,
  issue_opened: 3,
  issue_closed: 2,
  create: 1.5,
  push: 1,
  comment: 1,
  fork: 0.5,
  star: 0.25,
  other: 0
}

/** Map a raw GitHub events-API item into a normalized contribution (or null). */
function mapEvent(e: any): ForgeContribution | null {
  const type = String(e?.type ?? '')
  const actor = mapUser({ login: e?.actor?.login, avatar_url: e?.actor?.avatar_url, html_url: `https://github.com/${e?.actor?.login}` })
  const repoFull = String(e?.repo?.name ?? '')
  const [owner = '', name = ''] = repoFull.split('/')
  if (!actor || !owner || !name) return null
  const repo = { owner, name, fullName: repoFull, url: `https://github.com/${repoFull}` }
  const base = { provider: 'github' as const, id: String(e.id), actor, repo, createdAt: String(e.created_at ?? '') }
  const p = e.payload ?? {}

  let kind: ForgeEventKind
  let title: string | null | undefined
  let url: string | null | undefined
  let number: number | undefined
  let count: number | undefined
  let refType: string | undefined

  switch (type) {
    case 'PushEvent': {
      kind = 'push'
      count = p.size ?? p.commits?.length
      title = p.commits?.[p.commits.length - 1]?.message?.split('\n')[0]
      const branch = String(p.ref ?? '').replace('refs/heads/', '')
      url = `https://github.com/${repoFull}/commits/${branch}`
      break
    }
    case 'PullRequestEvent': {
      const merged = !!p.pull_request?.merged
      kind = p.action === 'closed' && merged ? 'pr_merged' : p.action === 'opened' || p.action === 'reopened' ? 'pr_opened' : 'other'
      title = p.pull_request?.title
      number = p.number ?? p.pull_request?.number
      url = p.pull_request?.html_url
      break
    }
    case 'PullRequestReviewEvent': {
      kind = 'pr_review'
      title = p.pull_request?.title
      number = p.pull_request?.number
      url = p.review?.html_url ?? p.pull_request?.html_url
      break
    }
    case 'IssuesEvent': {
      kind = p.action === 'closed' ? 'issue_closed' : p.action === 'opened' || p.action === 'reopened' ? 'issue_opened' : 'other'
      title = p.issue?.title
      number = p.issue?.number
      url = p.issue?.html_url
      break
    }
    case 'IssueCommentEvent':
    case 'PullRequestReviewCommentEvent':
    case 'CommitCommentEvent': {
      kind = 'comment'
      title = p.issue?.title ?? p.pull_request?.title
      number = p.issue?.number ?? p.pull_request?.number
      url = p.comment?.html_url
      break
    }
    case 'CreateEvent': {
      kind = 'create'
      refType = p.ref_type
      title = p.ref ? `${p.ref_type} ${p.ref}` : p.ref_type
      url = `https://github.com/${repoFull}`
      break
    }
    case 'ReleaseEvent': {
      kind = 'release'
      title = p.release?.name || p.release?.tag_name
      url = p.release?.html_url
      break
    }
    case 'ForkEvent': {
      kind = 'fork'
      url = p.forkee?.html_url
      break
    }
    case 'WatchEvent': {
      kind = 'star'
      url = repo.url
      break
    }
    default:
      return null
  }

  return { ...base, kind, title, url, number, count, refType, impact: EVENT_IMPACT[kind] }
}

export const githubProvider: ForgeProvider = {
  id: 'github',
  label: 'GitHub',
  icon: 'i-simple-icons-github',
  color: '#1f2328',
  ownerLabel: 'Owner',
  ownerPlaceholder: 'e.g. vuejs',
  repoPlaceholder: 'e.g. core',
  capabilities: {
    code: true,
    issues: true,
    pulls: true,
    discussions: true,
    actions: true,
    repoSearch: true,
    issueSearch: true,
    codeSearch: true,
    userSearch: true,
    discussionSearch: true
  },
  webUrl: (owner, repo) => `https://github.com/${owner}/${repo}`,
  ownerWebUrl: owner => `https://github.com/${owner}`,

  async getRepo(owner, repo, opts) {
    return mapRepo(await $fetch(`${API}/repos/${owner}/${repo}`, { headers: ghHeaders(opts), signal: opts?.signal }))
  },

  async getOverview(owner, repo, opts) {
    const meta = mapRepo(await $fetch(`${API}/repos/${owner}/${repo}`, { headers: ghHeaders(opts), signal: opts?.signal }))
    const [entries, readme] = await Promise.all([
      getRootTree(owner, repo, opts).catch(() => [] as ForgeTreeEntry[]),
      getReadme(owner, repo, undefined, opts)
    ])
    return { repo: meta, entries, readme }
  },

  async listRepos(owner, opts) {
    const data = await $fetch<unknown[]>(`${API}/users/${owner}/repos`, {
      headers: ghHeaders(opts),
      query: { per_page: 60, sort: 'updated', type: 'owner' },
      signal: opts?.signal
    })
    return (data as any[]).map(mapRepo)
  },

  async listBranches(repo, opts) {
    const data = await $fetch<any[]>(`${API}/repos/${repo.owner}/${repo.name}/branches`, {
      headers: ghHeaders(opts), query: { per_page: 100 }, signal: opts?.signal
    })
    return data.map((b): ForgeBranch => ({ name: b.name, commit: { sha: b.commit?.sha } }))
  },

  async getTree(repo, ref, path, opts) {
    const data = await $fetch<any>(`${API}/repos/${repo.owner}/${repo.name}/contents/${encodePath(path)}`, {
      headers: ghHeaders(opts), query: { ref }, signal: opts?.signal
    })
    const arr = Array.isArray(data) ? data : [data]
    return arr
      .map((e: any): ForgeTreeEntry => ({ name: e.name, path: e.path, type: e.type === 'dir' ? 'dir' : 'file', size: e.size, sha: e.sha }))
      .sort(sortEntries)
  },

  async getBlob(repo, ref, path, opts) {
    const r = await $fetch<any>(`${API}/repos/${repo.owner}/${repo.name}/contents/${encodePath(path)}`, {
      headers: ghHeaders(opts), query: { ref }, signal: opts?.signal
    })
    const b64: string = r.content ?? ''
    const binary = looksBinary(b64)
    return {
      path: r.path ?? path,
      ref,
      content: binary ? b64.replace(/\s/g, '') : decodeBase64Utf8(b64),
      encoding: binary ? 'base64' : 'utf-8',
      isBinary: binary,
      size: r.size
    } satisfies ForgeBlob
  },

  async listCommits(repo, ref, opts) {
    const limit = opts?.limit ?? 30
    const page = opts?.cursor ? Number(opts.cursor) : 1
    const data = await $fetch<any[]>(`${API}/repos/${repo.owner}/${repo.name}/commits`, {
      headers: ghHeaders(opts), query: { sha: ref, per_page: limit, page }, signal: opts?.signal
    })
    const items = data.map(mapCommit)
    return { items, cursor: items.length === limit ? String(page + 1) : undefined }
  },

  async getCommit(repo, sha, opts) {
    const r = await $fetch<any>(`${API}/repos/${repo.owner}/${repo.name}/commits/${sha}`, { headers: ghHeaders(opts), signal: opts?.signal })
    const base = mapCommit(r)
    return {
      ...base,
      stat: { additions: r.stats?.additions, deletions: r.stats?.deletions, filesChanged: r.files?.length },
      files: (r.files ?? []).map(mapFileDiff)
    } satisfies ForgeCommitDetail
  },

  async listIssues(repo, opts) {
    const limit = opts?.limit ?? 30
    const page = opts?.cursor ? Number(opts.cursor) : 1
    const data = await $fetch<any[]>(`${API}/repos/${repo.owner}/${repo.name}/issues`, {
      headers: ghHeaders(opts),
      query: { state: opts?.state ?? 'open', per_page: limit, page, sort: 'updated' },
      signal: opts?.signal
    })
    const items = data.filter(r => !r.pull_request).map(mapIssue)
    return { items, cursor: data.length === limit ? String(page + 1) : undefined }
  },

  async getIssue(repo, id, opts): Promise<ForgeIssueDetail> {
    const [issue, comments] = await Promise.all([
      $fetch<any>(`${API}/repos/${repo.owner}/${repo.name}/issues/${id}`, { headers: ghHeaders(opts), signal: opts?.signal }),
      $fetch<any[]>(`${API}/repos/${repo.owner}/${repo.name}/issues/${id}/comments`, { headers: ghHeaders(opts), query: { per_page: 100 }, signal: opts?.signal }).catch(() => [])
    ])
    return { ...mapIssue(issue), comments: comments.map(mapComment) }
  },

  async listPulls(repo, opts) {
    const limit = opts?.limit ?? 30
    const page = opts?.cursor ? Number(opts.cursor) : 1
    const state = opts?.state === 'merged' || opts?.state === 'draft' ? 'all' : (opts?.state ?? 'open')
    const data = await $fetch<any[]>(`${API}/repos/${repo.owner}/${repo.name}/pulls`, {
      headers: ghHeaders(opts), query: { state, per_page: limit, page, sort: 'updated', direction: 'desc' }, signal: opts?.signal
    })
    let items = data.map(mapPull)
    if (opts?.state === 'merged') items = items.filter(p => p.state === 'merged')
    if (opts?.state === 'draft') items = items.filter(p => p.state === 'draft')
    // GitHub's `state=closed` bundles merged PRs in; "Closed" should mean closed-not-merged.
    if (opts?.state === 'closed') items = items.filter(p => p.state === 'closed')
    return { items, cursor: data.length === limit ? String(page + 1) : undefined }
  },

  async getPull(repo, id, opts): Promise<ForgePullDetail> {
    const [pr, comments] = await Promise.all([
      $fetch<any>(`${API}/repos/${repo.owner}/${repo.name}/pulls/${id}`, { headers: ghHeaders(opts), signal: opts?.signal }),
      $fetch<any[]>(`${API}/repos/${repo.owner}/${repo.name}/issues/${id}/comments`, { headers: ghHeaders(opts), query: { per_page: 100 }, signal: opts?.signal }).catch(() => [])
    ])
    return {
      ...mapPull(pr),
      stat: { additions: pr.additions, deletions: pr.deletions, filesChanged: pr.changed_files },
      commitCount: pr.commits,
      comments: comments.map(mapComment)
    }
  },

  async getPullFiles(repo, id, opts) {
    const data = await $fetch<any[]>(`${API}/repos/${repo.owner}/${repo.name}/pulls/${id}/files`, {
      headers: ghHeaders(opts), query: { per_page: 100 }, signal: opts?.signal
    })
    return data.map(mapFileDiff)
  },

  async getPullCommits(repo, id, opts) {
    const data = await $fetch<any[]>(`${API}/repos/${repo.owner}/${repo.name}/pulls/${id}/commits`, {
      headers: ghHeaders(opts), query: { per_page: 100 }, signal: opts?.signal
    })
    return data.map(mapCommit)
  },

  async listActionRuns(repo, opts) {
    const limit = opts?.limit ?? 30
    const page = opts?.cursor ? Number(opts.cursor) : 1
    const data = await $fetch<any>(`${API}/repos/${repo.owner}/${repo.name}/actions/runs`, {
      headers: ghHeaders(opts), query: { per_page: limit, page }, signal: opts?.signal
    })
    const runs = (data.workflow_runs ?? []).map(mapRun)
    return { items: runs, total: data.total_count, cursor: runs.length === limit ? String(page + 1) : undefined }
  },

  async getActionRun(repo, id, opts) {
    const [run, jobs] = await Promise.all([
      $fetch<any>(`${API}/repos/${repo.owner}/${repo.name}/actions/runs/${id}`, { headers: ghHeaders(opts), signal: opts?.signal }),
      $fetch<any>(`${API}/repos/${repo.owner}/${repo.name}/actions/runs/${id}/jobs`, { headers: ghHeaders(opts), query: { per_page: 100 }, signal: opts?.signal }).catch(() => ({ jobs: [] }))
    ])
    return { ...mapRun(run), jobs: (jobs.jobs ?? []).map(mapJob) }
  },

  async listDiscussions(repo, opts): Promise<Paginated<ForgeDiscussion>> {
    // Discussions are GraphQL-only and require authentication.
    if (!opts?.token) return { items: [], incomplete: true }
    const query = `query($owner:String!,$name:String!,$first:Int!,$after:String){
      repository(owner:$owner,name:$name){
        discussions(first:$first,after:$after,orderBy:{field:UPDATED_AT,direction:DESC}){
          totalCount pageInfo{endCursor hasNextPage}
          nodes{ number title createdAt updatedAt url answerChosenAt
            category{name} comments{totalCount} author{login avatarUrl url} }
        }
      }
    }`
    const res = await ghGraphql<any>(query, { owner: repo.owner, name: repo.name, first: opts?.limit ?? 30, after: opts?.cursor ?? null }, opts)
    const conn = res?.repository?.discussions
    const items = (conn?.nodes ?? []).map((d: any): ForgeDiscussion => mapDiscussion(d))
    return { items, total: conn?.totalCount, cursor: conn?.pageInfo?.hasNextPage ? conn.pageInfo.endCursor : undefined }
  },

  async getDiscussion(repo, id, opts): Promise<ForgeDiscussionDetail> {
    if (!opts?.token) throw createError({ statusCode: 401, statusMessage: 'A GitHub token is required to view discussions.' })
    const query = `query($owner:String!,$name:String!,$number:Int!){
      repository(owner:$owner,name:$name){
        discussion(number:$number){ number title body createdAt updatedAt url answerChosenAt
          category{name} author{login avatarUrl url}
          comments(first:50){ nodes{ id body createdAt url author{login avatarUrl url} } } }
      }
    }`
    const res = await ghGraphql<any>(query, { owner: repo.owner, name: repo.name, number: Number(id) }, opts)
    const d = res?.repository?.discussion
    if (!d) throw createError({ statusCode: 404, statusMessage: 'Discussion not found.' })
    return {
      ...mapDiscussion(d),
      body: d.body,
      comments: (d.comments?.nodes ?? []).map((c: any): ForgeComment => ({
        id: String(c.id),
        author: c.author ? { provider: 'github', login: c.author.login, avatarUrl: c.author.avatarUrl, url: c.author.url } : undefined,
        body: c.body ?? '',
        createdAt: c.createdAt,
        url: c.url
      }))
    }
  },

  async searchRepos(q, opts): Promise<Paginated<ForgeRepo>> {
    const page = opts?.cursor ? Number(opts.cursor) : 1
    const perPage = opts?.limit ?? 20
    const data = await $fetch<any>(`${API}/search/repositories`, {
      headers: ghHeaders(opts),
      query: { q, per_page: perPage, page, sort: mapSort(opts?.sort), order: opts?.order },
      signal: opts?.signal
    })
    const items = (data.items ?? []).map(mapRepo)
    return { items, total: data.total_count, incomplete: data.incomplete_results, cursor: items.length === perPage ? String(page + 1) : undefined }
  },

  async searchIssues(q, opts): Promise<Paginated<ForgeIssue>> {
    const page = opts?.cursor ? Number(opts.cursor) : 1
    const perPage = opts?.limit ?? 20
    const data = await $fetch<any>(`${API}/search/issues`, {
      headers: ghHeaders(opts, 'application/vnd.github.text-match+json'),
      query: { q, per_page: perPage, page, sort: mapSort(opts?.sort), order: opts?.order },
      signal: opts?.signal
    })
    const items = (data.items ?? []).map((r: any) => {
      const issue = mapIssue(r)
      const repoUrl = r.repository_url ? String(r.repository_url) : ''
      const parts = repoUrl.split('/')
      const name = parts.pop() || ''
      const owner = parts.pop() || ''
      issue.repo = { provider: 'github', owner, name, fullName: `${owner}/${name}`, url: `https://github.com/${owner}/${name}` }
      return issue
    })
    return { items, total: data.total_count, incomplete: data.incomplete_results, cursor: items.length === perPage ? String(page + 1) : undefined }
  },

  async searchCode(q, opts): Promise<Paginated<ForgeSearchCode>> {
    // /search/code requires authentication.
    if (!opts?.token) return { items: [], incomplete: true }
    const page = opts?.cursor ? Number(opts.cursor) : 1
    const perPage = opts?.limit ?? 20
    const data = await $fetch<any>(`${API}/search/code`, {
      headers: ghHeaders(opts, 'application/vnd.github.text-match+json'),
      query: { q, per_page: perPage, page },
      signal: opts?.signal
    })
    const items = (data.items ?? []).map((r: any): ForgeSearchCode => ({
      provider: 'github',
      repo: { owner: r.repository?.owner?.login ?? '', name: r.repository?.name ?? '', fullName: r.repository?.full_name ?? '', url: r.repository?.html_url },
      path: r.path,
      url: r.html_url,
      fragments: (r.text_matches ?? []).map((m: any) => m.fragment).filter(Boolean)
    }))
    return { items, total: data.total_count, cursor: items.length === perPage ? String(page + 1) : undefined }
  },

  async searchUsers(q, opts): Promise<Paginated<ForgeUser>> {
    const page = opts?.cursor ? Number(opts.cursor) : 1
    const perPage = opts?.limit ?? 20
    const data = await $fetch<any>(`${API}/search/users`, {
      headers: ghHeaders(opts), query: { q, per_page: perPage, page }, signal: opts?.signal
    })
    const items = (data.items ?? []).map((u: any): ForgeUser => ({
      provider: 'github', login: u.login, avatarUrl: u.avatar_url, url: u.html_url
    }))
    return { items, total: data.total_count, cursor: items.length === perPage ? String(page + 1) : undefined }
  },

  async searchDiscussions(q, opts): Promise<Paginated<ForgeDiscussion>> {
    // Discussion search is GraphQL-only and requires authentication.
    if (!opts?.token) return { items: [], incomplete: true }
    const query = `query($q:String!,$first:Int!,$after:String){
      search(type:DISCUSSION,query:$q,first:$first,after:$after){
        discussionCount pageInfo{endCursor hasNextPage}
        nodes{ ... on Discussion {
          number title createdAt updatedAt url answerChosenAt
          category{name} comments{totalCount} author{login avatarUrl url}
          repository{ name nameWithOwner url owner{login} }
        } }
      }
    }`
    const res = await ghGraphql<any>(query, { q, first: opts?.limit ?? 20, after: opts?.cursor ?? null }, opts)
    const conn = res?.search
    const items = (conn?.nodes ?? []).filter(Boolean).map((d: any): ForgeDiscussion => {
      const base = mapDiscussion(d)
      const r = d.repository
      if (r) base.repo = { provider: 'github', owner: r.owner?.login ?? '', name: r.name ?? '', fullName: r.nameWithOwner ?? '', url: r.url }
      return base
    })
    return { items, total: conn?.discussionCount, cursor: conn?.pageInfo?.hasNextPage ? conn.pageInfo.endCursor : undefined }
  },

  async listNotifications(opts): Promise<ForgeNotification[]> {
    if (!opts?.token) return []
    const data = await $fetch<any[]>(`${API}/notifications`, {
      headers: ghHeaders(opts),
      query: { per_page: opts?.limit ?? 30, all: false },
      signal: opts?.signal
    })
    return (data ?? []).map((n: any): ForgeNotification => {
      const owner = n.repository?.owner?.login ?? ''
      const name = n.repository?.name ?? ''
      const type = String(n.subject?.type ?? '').toLowerCase()
      const kind: ForgeNotification['kind']
        = type === 'pullrequest'
          ? 'pull'
          : type === 'issue'
            ? 'issue'
            : type === 'discussion'
              ? 'discussion'
              : type === 'commit'
                ? 'commit'
                : type === 'release'
                  ? 'release'
                  : 'other'
      // subject.url points at the API resource; derive an in-app route.
      const apiUrl = String(n.subject?.url ?? '')
      const numMatch = apiUrl.match(/\/(?:issues|pulls)\/(\d+)$/)
      const seg = kind === 'pull' ? 'pulls' : 'issues'
      const to = owner && name && numMatch
        ? `/github/${owner}/${name}/${seg}/${numMatch[1]}`
        : owner && name ? `/github/${owner}/${name}` : null
      return {
        provider: 'github',
        id: String(n.id),
        kind,
        title: n.subject?.title ?? '(notification)',
        reason: n.reason,
        unread: !!n.unread,
        updatedAt: n.updated_at,
        repo: owner && name ? { owner, name, fullName: n.repository?.full_name ?? `${owner}/${name}` } : undefined,
        to,
        url: n.repository?.html_url
      }
    })
  },

  async listFollowedRepos(opts): Promise<ForgeRepo[]> {
    const token = opts?.token ?? getForgeToken('github')
    if (!token) return []
    const headers = ghHeaders(opts)
    // Only people, not orgs: /user/following mixes User and Organization
    // accounts, and org membership is irrelevant here — the goal is to see what
    // the humans you follow are actually building.
    const following = await $fetch<any[]>(`${API}/user/following`, {
      headers,
      query: { per_page: 100 },
      signal: opts?.signal
    }).catch(() => [])
    const owners = (following as any[])
      .filter(u => String(u.type) === 'User')
      .map(u => String(u.login))
    // Pull a few recently-pushed repos from each followed person, bounded so
    // the feed stays fast even for people who follow hundreds of accounts.
    const perOwner = await Promise.all(owners.slice(0, 20).map(async (login) => {
      try {
        const data = await $fetch<any[]>(`${API}/users/${login}/repos`, {
          headers,
          query: { per_page: 5, sort: 'pushed', type: 'owner' },
          signal: opts?.signal
        })
        return (data ?? []).map(mapRepo)
      } catch {
        return [] as ForgeRepo[]
      }
    }))
    const seen = new Set<string>()
    return perOwner
      .flat()
      .filter(r => !r.isFork && !r.isPrivate)
      .filter(r => (seen.has(r.fullName) ? false : (seen.add(r.fullName), true)))
      .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))
  },

  async listFollowing(opts): Promise<ForgeUser[]> {
    const token = opts?.token ?? getForgeToken('github')
    if (!token) return []
    const data = await $fetch<any[]>(`${API}/user/following`, {
      headers: ghHeaders(opts),
      query: { per_page: opts?.limit ?? 100 },
      signal: opts?.signal
    }).catch(() => [])
    return (data ?? [])
      .filter(u => String(u.type) === 'User')
      .map(u => mapUser(u))
      .filter((u): u is ForgeUser => !!u)
  },

  async listUserEvents(login, opts): Promise<ForgeContribution[]> {
    // Authenticated request against the given user: GitHub returns that user's
    // public events (plus your own private ones when login === you). Bounded to
    // ~90 days / 300 events by the API.
    const data = await $fetch<any[]>(`${API}/users/${encodeURIComponent(login)}/events`, {
      headers: ghHeaders(opts),
      query: { per_page: Math.min(opts?.limit ?? 100, 100) },
      signal: opts?.signal
    }).catch(() => [])
    return (data ?? []).map(mapEvent).filter((c): c is ForgeContribution => !!c)
  }
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

function mapSort(sort?: ForgeSearchOptions['sort']): string | undefined {
  switch (sort) {
    case 'stars': return 'stars'
    case 'forks': return 'forks'
    case 'updated': return 'updated'
    default: return undefined
  }
}
