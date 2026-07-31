import type {
  ForgeBranch,
  ForgeBlob,
  ForgeCommitDetail,
  ForgeComment,
  ForgeContribution,
  ForgeDiscussion,
  ForgeDiscussionDetail,
  ForgeInboxItem,
  ForgeIssue,
  ForgeIssueDetail,
  ForgeJobLog,
  ForgeMergeQueueEntry,
  ForgeMergeQueueStats,
  ForgeMergeResult,
  ForgeMyWork,
  ForgeNotification,
  ForgePullDetail,
  ForgeProvider,
  ForgeReactionTarget,
  ForgeReadOptions,
  ForgeRepo,
  ForgeSearchCode,
  ForgeSearchOptions,
  ForgeTreeEntry,
  ForgeUser,
  Paginated,
  RepoLocator
} from '~/types/forge'

import { getForgeToken } from '~/lib/forges/token-store'
import { parseActionsRunnerLog } from '~/lib/forges/actions-log'
import { cachedFetch } from '~/lib/forges/cached-fetch'
import type {
  GhActionJobsListResponse,
  GhActionRunResponse,
  GhActionRunsListResponse,
  GhBranchResponse,
  GhCommentResponse,
  GhCommitResponse,
  GhEventResponse,
  GhFileDiffResponse,
  GhGraphqlDiscussionDetailResponse,
  GhGraphqlDiscussionListResponse,
  GhGraphqlDiscussionNode,
  GhGraphqlDiscussionSearchResponse,
  GhGraphqlMergeQueueEntryNode,
  GhGraphqlMergeQueueResponse,
  GhIssueResponse,
  GhMergeResultResponse,
  GhNotificationResponse,
  GhPullResponse,
  GhReadmeResponse,
  GhRepoResponse,
  GhSearchCodeResponse,
  GhSearchIssuesResponse,
  GhSearchReposResponse,
  GhSearchUsersResponse,
  GhTreeEntryResponse,
  GhUserResponse
} from './types'
import {
  botKindOf,
  decodeBase64Utf8,
  GH_REACTION_CONTENT,
  GH_REACTION_GRAPHQL,
  looksBinary,
  mapComment,
  mapCommit,
  mapDiscussion,
  mapDiscussionComment,
  mapEvent,
  mapFileDiff,
  mapIssue,
  mapJob,
  mapPull,
  mapReactionGroups,
  mapReactions,
  mapRepo,
  mapRun,
  mapUser,
  pullState,
  sortEntries
} from './mappers'

const API = 'https://api.github.com'

function ghHeaders(
  opts?: ForgeReadOptions,
  accept = 'application/vnd.github+json'
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: accept,
    'X-GitHub-Api-Version': '2022-11-28'
  }
  const token = opts?.token ?? getForgeToken('github')
  if (token) headers.Authorization = 'Bearer ' + token
  return headers
}

async function ghGraphql<T>(
  query: string,
  variables: Record<string, unknown>,
  opts?: ForgeReadOptions
): Promise<T> {
  const res = await $fetch<{ data?: T; errors?: { message: string }[] }>(`${API}/graphql`, {
    method: 'POST',
    headers: ghHeaders(opts),
    body: { query, variables },
    signal: opts?.signal
  })
  if (res.errors?.length)
    throw createError({ statusCode: 400, statusMessage: res.errors[0]?.message ?? 'GraphQL error' })
  return res.data as T
}

/** Search-endpoint fetch: anonymous reads go through maintainers.space's cached proxy, token reads go straight to GitHub. */
async function ghSearchFetch<T>(
  path: string,
  query: Record<string, unknown>,
  opts?: ForgeSearchOptions,
  accept = 'application/vnd.github+json'
): Promise<T> {
  const token = opts?.token ?? getForgeToken('github')
  return cachedFetch<T>(`${API}${path}`, query, {
    token,
    headers: ghHeaders({ ...opts, token }, accept),
    accept,
    noCache: opts?.noCache,
    signal: opts?.signal
  })
}

const ghLoginCache = new Map<string, string>()

/** Needed to find "my" reaction id for removal — the REST reactions API has no per-viewer field. */
async function ghCurrentLogin(opts?: ForgeReadOptions): Promise<string | null> {
  const token = opts?.token ?? getForgeToken('github')
  if (!token) return null
  const cached = ghLoginCache.get(token)
  if (cached) return cached
  try {
    const user = await $fetch<{ login?: string }>(`${API}/user`, {
      headers: ghHeaders(opts),
      signal: opts?.signal
    })
    if (user.login) ghLoginCache.set(token, user.login)
    return user.login ?? null
  } catch {
    return null
  }
}

/** Discussions have no REST reactions API; resolve the root post's GraphQL node id to react to it. */
async function ghDiscussionNodeId(
  repo: RepoLocator,
  number: number,
  opts?: ForgeReadOptions
): Promise<string | null> {
  const res = await ghGraphql<{ repository?: { discussion?: { id?: string } } }>(
    `query($owner:String!,$name:String!,$number:Int!){
      repository(owner:$owner,name:$name){ discussion(number:$number){ id } }
    }`,
    { owner: repo.owner, name: repo.name, number },
    opts
  )
  return res?.repository?.discussion?.id ?? null
}

function ghReactionsPath(repo: RepoLocator, target: ForgeReactionTarget): string {
  const base = `/repos/${repo.owner}/${repo.name}`
  return target.commentId
    ? `${base}/issues/comments/${target.commentId}/reactions`
    : `${base}/issues/${target.threadId}/reactions`
}

/** Bounded-concurrency map, so notification fan-out stays responsive. */
async function ghMapLimit<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length })
  let cursor = 0
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const idx = cursor++
      results[idx] = await fn(items[idx]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) || 1 }, worker))
  return results
}

/** Best-effort HTTP status extraction from an ofetch error. */
function errStatus(e: unknown): number | undefined {
  if (!e || typeof e !== 'object') return undefined
  const err = e as { statusCode?: number; status?: number; response?: { status?: number } }
  return err.statusCode ?? err.status ?? err.response?.status
}

async function getRootTree(
  owner: string,
  repo: string,
  opts?: ForgeReadOptions
): Promise<ForgeTreeEntry[]> {
  const data = await $fetch<GhTreeEntryResponse | GhTreeEntryResponse[]>(
    `${API}/repos/${owner}/${repo}/contents`,
    {
      headers: ghHeaders(opts),
      signal: opts?.signal
    }
  )
  const arr = Array.isArray(data) ? data : [data]
  return arr
    .map(
      (e): ForgeTreeEntry => ({
        name: e.name,
        path: e.path,
        type: e.type === 'dir' ? 'dir' : 'file',
        size: e.size,
        sha: e.sha
      })
    )
    .sort(sortEntries)
}

async function getReadme(owner: string, repo: string, ref?: string, opts?: ForgeReadOptions) {
  try {
    const r = await $fetch<GhReadmeResponse>(`${API}/repos/${owner}/${repo}/readme`, {
      headers: ghHeaders(opts),
      query: ref ? { ref } : undefined,
      signal: opts?.signal
    })
    return { filename: r.name, content: decodeBase64Utf8(r.content) }
  } catch {
    return null
  }
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

function mapSort(sort?: ForgeSearchOptions['sort']): string | undefined {
  switch (sort) {
    case 'stars':
      return 'stars'
    case 'forks':
      return 'forks'
    case 'updated':
      return 'updated'
    default:
      return undefined
  }
}

export const githubProvider: ForgeProvider = {
  id: 'github',
  label: 'GitHub',
  icon: 'i-simple-icons-github',
  color: '#1f2328',
  dominance: 12,
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
    discussionSearch: true,
    star: true,
    mergeQueue: true,
    reactions: true
  },
  webUrl: (owner, repo) => `https://github.com/${owner}/${repo}`,
  ownerWebUrl: (owner) => `https://github.com/${owner}`,

  async getRepo(owner, repo, opts) {
    return mapRepo(
      await $fetch<GhRepoResponse>(`${API}/repos/${owner}/${repo}`, {
        headers: ghHeaders(opts),
        signal: opts?.signal
      })
    )
  },

  async getLanguages(owner, repo, opts) {
    return $fetch<Record<string, number>>(`${API}/repos/${owner}/${repo}/languages`, {
      headers: ghHeaders(opts),
      signal: opts?.signal
    }).catch(() => undefined)
  },

  async getOverview(owner, repo, opts) {
    const meta = mapRepo(
      await $fetch<GhRepoResponse>(`${API}/repos/${owner}/${repo}`, {
        headers: ghHeaders(opts),
        signal: opts?.signal
      })
    )
    const [entries, readme] = await Promise.all([
      getRootTree(owner, repo, opts).catch(() => [] as ForgeTreeEntry[]),
      getReadme(owner, repo, undefined, opts)
    ])
    return { repo: meta, entries, readme }
  },

  async listRepos(owner, opts) {
    const data = await $fetch<GhRepoResponse[]>(`${API}/users/${owner}/repos`, {
      headers: ghHeaders(opts),
      query: { per_page: 60, sort: 'updated', type: 'owner' },
      signal: opts?.signal
    })
    return data.map(mapRepo)
  },

  async listBranches(repo, opts) {
    const data = await $fetch<GhBranchResponse[]>(
      `${API}/repos/${repo.owner}/${repo.name}/branches`,
      {
        headers: ghHeaders(opts),
        query: { per_page: 100 },
        signal: opts?.signal
      }
    )
    return data.map((b): ForgeBranch => ({ name: b.name, commit: { sha: b.commit?.sha } }))
  },

  async getTree(repo, ref, path, opts) {
    const data = await $fetch<GhTreeEntryResponse | GhTreeEntryResponse[]>(
      `${API}/repos/${repo.owner}/${repo.name}/contents/${encodePath(path)}`,
      {
        headers: ghHeaders(opts),
        query: { ref },
        signal: opts?.signal
      }
    )
    const arr = Array.isArray(data) ? data : [data]
    return arr
      .map(
        (e): ForgeTreeEntry => ({
          name: e.name,
          path: e.path,
          type: e.type === 'dir' ? 'dir' : 'file',
          size: e.size,
          sha: e.sha
        })
      )
      .sort(sortEntries)
  },

  async getBlob(repo, ref, path, opts) {
    const r = await $fetch<GhTreeEntryResponse>(
      `${API}/repos/${repo.owner}/${repo.name}/contents/${encodePath(path)}`,
      {
        headers: ghHeaders(opts),
        query: { ref },
        signal: opts?.signal
      }
    )
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
    const data = await $fetch<GhCommitResponse[]>(
      `${API}/repos/${repo.owner}/${repo.name}/commits`,
      {
        headers: ghHeaders(opts),
        query: { sha: ref, per_page: limit, page },
        signal: opts?.signal
      }
    )
    const items = data.map(mapCommit)
    return { items, cursor: items.length === limit ? String(page + 1) : undefined }
  },

  async getCommit(repo, sha, opts) {
    const r = await $fetch<GhCommitResponse>(
      `${API}/repos/${repo.owner}/${repo.name}/commits/${sha}`,
      {
        headers: ghHeaders(opts),
        signal: opts?.signal
      }
    )
    const base = mapCommit(r)
    return {
      ...base,
      stat: {
        additions: r.stats?.additions,
        deletions: r.stats?.deletions,
        filesChanged: r.files?.length
      },
      files: (r.files ?? []).map(mapFileDiff)
    } satisfies ForgeCommitDetail
  },

  async listIssues(repo, opts) {
    const limit = opts?.limit ?? 30
    const page = opts?.cursor ? Number(opts.cursor) : 1
    const data = await $fetch<GhIssueResponse[]>(`${API}/repos/${repo.owner}/${repo.name}/issues`, {
      headers: ghHeaders(opts),
      query: { state: opts?.state ?? 'open', per_page: limit, page, sort: 'updated' },
      signal: opts?.signal
    })
    const items = data.filter((r) => !r.pull_request).map(mapIssue)
    return { items, cursor: data.length === limit ? String(page + 1) : undefined }
  },

  async getIssue(repo, id, opts): Promise<ForgeIssueDetail> {
    const [issue, comments] = await Promise.all([
      $fetch<GhIssueResponse>(`${API}/repos/${repo.owner}/${repo.name}/issues/${id}`, {
        headers: ghHeaders(opts),
        signal: opts?.signal
      }),
      $fetch<GhCommentResponse[]>(`${API}/repos/${repo.owner}/${repo.name}/issues/${id}/comments`, {
        headers: ghHeaders(opts),
        query: { per_page: 100 },
        signal: opts?.signal
      }).catch(() => [])
    ])
    return {
      ...mapIssue(issue),
      comments: comments.map(mapComment),
      reactions: mapReactions(issue.reactions)
    }
  },

  async listPulls(repo, opts) {
    const limit = opts?.limit ?? 30
    const page = opts?.cursor ? Number(opts.cursor) : 1
    const state =
      opts?.state === 'merged' || opts?.state === 'draft' ? 'all' : (opts?.state ?? 'open')
    const data = await $fetch<GhPullResponse[]>(`${API}/repos/${repo.owner}/${repo.name}/pulls`, {
      headers: ghHeaders(opts),
      query: { state, per_page: limit, page, sort: 'updated', direction: 'desc' },
      signal: opts?.signal
    })
    let items = data.map(mapPull)
    if (opts?.state === 'merged') items = items.filter((p) => p.state === 'merged')
    if (opts?.state === 'draft') items = items.filter((p) => p.state === 'draft')
    // GitHub's `state=closed` bundles merged PRs in; "Closed" should mean closed-not-merged.
    if (opts?.state === 'closed') items = items.filter((p) => p.state === 'closed')
    return { items, cursor: data.length === limit ? String(page + 1) : undefined }
  },

  async getPull(repo, id, opts): Promise<ForgePullDetail> {
    const [pr, comments] = await Promise.all([
      $fetch<GhPullResponse>(`${API}/repos/${repo.owner}/${repo.name}/pulls/${id}`, {
        headers: ghHeaders(opts),
        signal: opts?.signal
      }),
      $fetch<GhCommentResponse[]>(`${API}/repos/${repo.owner}/${repo.name}/issues/${id}/comments`, {
        headers: ghHeaders(opts),
        query: { per_page: 100 },
        signal: opts?.signal
      }).catch(() => [])
    ])
    return {
      ...mapPull(pr),
      stat: { additions: pr.additions, deletions: pr.deletions, filesChanged: pr.changed_files },
      commitCount: pr.commits,
      comments: comments.map(mapComment),
      reactions: mapReactions(pr.reactions)
    }
  },

  async getPullFiles(repo, id, opts) {
    const data = await $fetch<GhFileDiffResponse[]>(
      `${API}/repos/${repo.owner}/${repo.name}/pulls/${id}/files`,
      {
        headers: ghHeaders(opts),
        query: { per_page: 100 },
        signal: opts?.signal
      }
    )
    return data.map(mapFileDiff)
  },

  async getPullCommits(repo, id, opts) {
    const data = await $fetch<GhCommitResponse[]>(
      `${API}/repos/${repo.owner}/${repo.name}/pulls/${id}/commits`,
      {
        headers: ghHeaders(opts),
        query: { per_page: 100 },
        signal: opts?.signal
      }
    )
    return data.map(mapCommit)
  },

  async getMergeQueue(repo, branch, opts): Promise<ForgeMergeQueueStats | null> {
    const query = `query($owner:String!,$name:String!,$branch:String){
      repository(owner:$owner,name:$name){
        mergeQueue(branch:$branch){
          entries(first:50){
            nodes{
              state
              enqueuedAt
              pullRequest{ number title url author{ login avatarUrl url } }
            }
          }
        }
      }
    }`
    let data: GhGraphqlMergeQueueResponse | undefined
    try {
      data = await ghGraphql<GhGraphqlMergeQueueResponse>(
        query,
        { owner: repo.owner, name: repo.name, branch: branch ?? null },
        opts
      )
    } catch {
      return null
    }
    const mq = data?.repository?.mergeQueue
    if (!mq) return null
    const nodes = (mq.entries?.nodes ?? []).filter((n): n is GhGraphqlMergeQueueEntryNode => !!n)
    const entries: ForgeMergeQueueEntry[] = nodes.map((n, i) => {
      const a = n.pullRequest?.author
      return {
        position: i + 1,
        number: n.pullRequest?.number,
        title: n.pullRequest?.title ?? '',
        author: a
          ? {
              provider: 'github',
              login: a.login ?? '',
              avatarUrl: a.avatarUrl ?? null,
              url: a.url ?? null
            }
          : undefined,
        status: n.state ?? undefined,
        enqueuedAt: n.enqueuedAt ?? null,
        url: n.pullRequest?.url ?? null,
        ref: n.pullRequest?.number != null ? { number: n.pullRequest.number } : undefined
      }
    })
    if (!entries.length) return null
    return { branch: branch ?? '', kind: 'queue', entries }
  },

  async listActionRuns(repo, opts) {
    const limit = opts?.limit ?? 30
    const page = opts?.cursor ? Number(opts.cursor) : 1
    const data = await $fetch<GhActionRunsListResponse>(
      `${API}/repos/${repo.owner}/${repo.name}/actions/runs`,
      {
        headers: ghHeaders(opts),
        query: { per_page: limit, page },
        signal: opts?.signal
      }
    )
    const runs = (data.workflow_runs ?? []).map(mapRun)
    return {
      items: runs,
      total: data.total_count,
      cursor: runs.length === limit ? String(page + 1) : undefined
    }
  },

  async getActionRun(repo, id, opts) {
    const [run, jobs] = await Promise.all([
      $fetch<GhActionRunResponse>(`${API}/repos/${repo.owner}/${repo.name}/actions/runs/${id}`, {
        headers: ghHeaders(opts),
        signal: opts?.signal
      }),
      $fetch<GhActionJobsListResponse>(
        `${API}/repos/${repo.owner}/${repo.name}/actions/runs/${id}/jobs`,
        {
          headers: ghHeaders(opts),
          query: { per_page: 100 },
          signal: opts?.signal
        }
      ).catch(() => ({ jobs: [] }))
    ])
    return { ...mapRun(run), jobs: (jobs.jobs ?? []).map(mapJob) }
  },

  async getActionJobLog(repo, jobId, opts): Promise<ForgeJobLog | null> {
    // GitHub's logs endpoint redirects to blob storage whose CORS is locked to
    // GitHub's own origin — fetch it via maintainers.space's own server instead, where
    // redirects are just followed server-to-server with no CORS involved.
    const token = opts?.token ?? getForgeToken('github')
    if (!token) return null
    try {
      const text = await $fetch<string>('/api/github/actions-log', {
        query: { owner: repo.owner, repo: repo.name, jobId },
        headers: { Authorization: `Bearer ${token}` },
        signal: opts?.signal
      })
      return parseActionsRunnerLog(text)
    } catch {
      return null
    }
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
    const res = await ghGraphql<GhGraphqlDiscussionListResponse>(
      query,
      { owner: repo.owner, name: repo.name, first: opts?.limit ?? 30, after: opts?.cursor ?? null },
      opts
    )
    const conn = res?.repository?.discussions
    const items = (conn?.nodes ?? []).map((d): ForgeDiscussion => mapDiscussion(d))
    return {
      items,
      total: conn?.totalCount,
      cursor: conn?.pageInfo?.hasNextPage ? conn.pageInfo.endCursor : undefined
    }
  },

  async getDiscussion(repo, id, opts): Promise<ForgeDiscussionDetail> {
    if (!opts?.token)
      throw createError({
        statusCode: 401,
        statusMessage: 'A GitHub token is required to view discussions.'
      })
    const reactionFields = 'reactionGroups{ content viewerHasReacted users{totalCount} }'
    const query = `query($owner:String!,$name:String!,$number:Int!){
      repository(owner:$owner,name:$name){
        discussion(number:$number){ id number title body createdAt updatedAt url answerChosenAt
          category{name} author{login avatarUrl url} ${reactionFields}
          comments(first:50){ nodes{ id body createdAt url author{login avatarUrl url} ${reactionFields}
            replies(first:50){ nodes{ id body createdAt url author{login avatarUrl url} ${reactionFields} } } } } }
      }
    }`
    const res = await ghGraphql<GhGraphqlDiscussionDetailResponse>(
      query,
      { owner: repo.owner, name: repo.name, number: Number(id) },
      opts
    )
    const d = res?.repository?.discussion
    if (!d) throw createError({ statusCode: 404, statusMessage: 'Discussion not found.' })
    return {
      ...mapDiscussion(d),
      body: d.body,
      comments: (d.comments?.nodes ?? []).map(mapDiscussionComment),
      reactions: mapReactionGroups(d.reactionGroups)
    }
  },

  async searchRepos(q, opts): Promise<Paginated<ForgeRepo>> {
    const page = opts?.cursor ? Number(opts.cursor) : 1
    const perPage = opts?.limit ?? 20
    const data = await ghSearchFetch<GhSearchReposResponse>(
      '/search/repositories',
      { q, per_page: perPage, page, sort: mapSort(opts?.sort), order: opts?.order },
      opts
    )
    const items = (data.items ?? []).map(mapRepo)
    return {
      items,
      total: data.total_count,
      incomplete: data.incomplete_results,
      cursor: items.length === perPage ? String(page + 1) : undefined
    }
  },

  async searchIssues(q, opts): Promise<Paginated<ForgeIssue>> {
    const page = opts?.cursor ? Number(opts.cursor) : 1
    const perPage = opts?.limit ?? 20
    const data = await ghSearchFetch<GhSearchIssuesResponse>(
      '/search/issues',
      { q, per_page: perPage, page, sort: mapSort(opts?.sort), order: opts?.order },
      opts,
      'application/vnd.github.text-match+json'
    )
    const items = (data.items ?? []).map((r) => {
      const issue = mapIssue(r)
      const repoUrl = r.repository_url ? String(r.repository_url) : ''
      const parts = repoUrl.split('/')
      const name = parts.pop() || ''
      const owner = parts.pop() || ''
      issue.repo = {
        provider: 'github',
        owner,
        name,
        fullName: `${owner}/${name}`,
        url: `https://github.com/${owner}/${name}`
      }
      return issue
    })
    return {
      items,
      total: data.total_count,
      incomplete: data.incomplete_results,
      cursor: items.length === perPage ? String(page + 1) : undefined
    }
  },

  async searchCode(q, opts): Promise<Paginated<ForgeSearchCode>> {
    // /search/code requires authentication.
    if (!opts?.token) return { items: [], incomplete: true }
    const page = opts?.cursor ? Number(opts.cursor) : 1
    const perPage = opts?.limit ?? 20
    const data = await $fetch<GhSearchCodeResponse>(`${API}/search/code`, {
      headers: ghHeaders(opts, 'application/vnd.github.text-match+json'),
      query: { q, per_page: perPage, page },
      signal: opts?.signal
    })
    const items = (data.items ?? []).map(
      (r): ForgeSearchCode => ({
        provider: 'github',
        repo: {
          owner: r.repository?.owner?.login ?? '',
          name: r.repository?.name ?? '',
          fullName: r.repository?.full_name ?? '',
          url: r.repository?.html_url
        },
        path: r.path,
        url: r.html_url,
        fragments: (r.text_matches ?? []).map((m) => m.fragment).filter(Boolean) as string[]
      })
    )
    return {
      items,
      total: data.total_count,
      cursor: items.length === perPage ? String(page + 1) : undefined
    }
  },

  async searchUsers(q, opts): Promise<Paginated<ForgeUser>> {
    const page = opts?.cursor ? Number(opts.cursor) : 1
    const perPage = opts?.limit ?? 20
    const data = await ghSearchFetch<GhSearchUsersResponse>(
      '/search/users',
      { q, per_page: perPage, page },
      opts
    )
    const items = (data.items ?? []).map(
      (u): ForgeUser => ({
        provider: 'github',
        login: u.login ?? '',
        avatarUrl: u.avatar_url,
        url: u.html_url
      })
    )
    return {
      items,
      total: data.total_count,
      cursor: items.length === perPage ? String(page + 1) : undefined
    }
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
    const res = await ghGraphql<GhGraphqlDiscussionSearchResponse>(
      query,
      { q, first: opts?.limit ?? 20, after: opts?.cursor ?? null },
      opts
    )
    const conn = res?.search
    const items = (conn?.nodes ?? [])
      .filter((d): d is GhGraphqlDiscussionNode => !!d)
      .map((d): ForgeDiscussion => {
        const base = mapDiscussion(d)
        const r = d.repository
        if (r)
          base.repo = {
            provider: 'github',
            owner: r.owner?.login ?? '',
            name: r.name ?? '',
            fullName: r.nameWithOwner ?? '',
            url: r.url
          }
        return base
      })
    return {
      items,
      total: conn?.discussionCount,
      cursor: conn?.pageInfo?.hasNextPage ? conn.pageInfo.endCursor : undefined
    }
  },

  async listNotifications(opts): Promise<ForgeNotification[]> {
    if (!opts?.token) return []
    const data = await $fetch<GhNotificationResponse[]>(`${API}/notifications`, {
      headers: ghHeaders(opts),
      query: { per_page: opts?.limit ?? 30, all: false },
      signal: opts?.signal
    })
    return (data ?? []).map((n): ForgeNotification => {
      const owner = n.repository?.owner?.login ?? ''
      const name = n.repository?.name ?? ''
      const type = String(n.subject?.type ?? '').toLowerCase()
      const kind: ForgeNotification['kind'] =
        type === 'pullrequest'
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
      const apiUrl = String(n.subject?.url ?? '')
      const numMatch = apiUrl.match(/\/(?:issues|pulls)\/(\d+)$/)
      const seg = kind === 'pull' ? 'pulls' : 'issues'
      const to =
        owner && name && numMatch
          ? `/github/${owner}/${name}/${seg}/${numMatch[1]}`
          : owner && name
            ? `/github/${owner}/${name}`
            : null
      return {
        provider: 'github',
        id: String(n.id),
        kind,
        title: n.subject?.title ?? '(notification)',
        reason: n.reason,
        unread: !!n.unread,
        updatedAt: n.updated_at,
        repo:
          owner && name
            ? { owner, name, fullName: n.repository?.full_name ?? `${owner}/${name}` }
            : undefined,
        to,
        url: n.repository?.html_url
      }
    })
  },

  async listInbox(opts): Promise<ForgeInboxItem[]> {
    const token = opts?.token ?? getForgeToken('github')
    if (!token) return []
    const headers = ghHeaders(opts)
    const [raw, me] = await Promise.all([
      $fetch<GhNotificationResponse[]>(`${API}/notifications`, {
        headers,
        query: { per_page: opts?.limit ?? 50, all: false },
        signal: opts?.signal
      }).catch(() => []),
      $fetch<GhUserResponse>(`${API}/user`, { headers, signal: opts?.signal }).catch(() => null)
    ])
    const myLogin = String(me?.login ?? '').toLowerCase()

    const items = await ghMapLimit(raw ?? [], 6, async (n): Promise<ForgeInboxItem | null> => {
      const owner = n.repository?.owner?.login ?? ''
      const name = n.repository?.name ?? ''
      const type = String(n.subject?.type ?? '').toLowerCase()
      const apiUrl = String(n.subject?.url ?? '')
      const numMatch = apiUrl.match(/\/(?:issues|pulls)\/(\d+)$/)
      const number = numMatch ? Number(numMatch[1]) : undefined
      const kind: ForgeNotification['kind'] =
        type === 'pullrequest'
          ? 'pull'
          : type === 'issue'
            ? 'issue'
            : type === 'discussion'
              ? 'discussion'
              : type === 'commit'
                ? 'commit'
                : type === 'release'
                  ? 'release'
                  : type === 'checksuite'
                    ? 'ci'
                    : 'other'
      const seg = kind === 'pull' ? 'pulls' : 'issues'
      const to =
        kind === 'ci' && owner && name
          ? `/github/${owner}/${name}/actions`
          : owner && name && number
            ? `/github/${owner}/${name}/${seg}/${number}`
            : owner && name
              ? `/github/${owner}/${name}`
              : null

      const item: ForgeInboxItem = {
        provider: 'github',
        id: String(n.id),
        kind,
        title: n.subject?.title ?? '(notification)',
        reason: n.reason,
        unread: !!n.unread,
        updatedAt: n.updated_at,
        repo:
          owner && name
            ? { owner, name, fullName: n.repository?.full_name ?? `${owner}/${name}` }
            : undefined,
        to,
        url: n.repository?.html_url,
        number
      }

      // Resolved (closed/merged) items are tagged, not dropped, so the inbox can
      // group them under "recently resolved".
      if ((kind === 'pull' || kind === 'issue') && apiUrl && number) {
        try {
          const subj = await $fetch<GhPullResponse>(apiUrl, { headers, signal: opts?.signal })
          const resolved =
            kind === 'pull'
              ? !!(subj.merged_at || subj.state === 'closed')
              : subj.state === 'closed'
          item.state =
            kind === 'pull' ? pullState(subj) : subj.state === 'closed' ? 'closed' : 'open'
          item.resolved = resolved
          item.author = mapUser(subj.user)
          const bk = botKindOf(subj.user?.login)
          item.isBot = !!bk
          item.botKind = bk
          if (kind === 'pull') {
            item.stat = {
              additions: subj.additions,
              deletions: subj.deletions,
              filesChanged: subj.changed_files
            }
          }
          if (!resolved && n.unread && (subj.comments ?? 0) > 0) {
            const since = n.last_read_at
            const cs = await $fetch<GhCommentResponse[]>(
              `${API}/repos/${owner}/${name}/issues/${number}/comments`,
              {
                headers,
                query: since ? { since, per_page: 100 } : { per_page: 100 },
                signal: opts?.signal
              }
            ).catch(() => [])
            item.unreadComments = (cs ?? [])
              .filter((c) => String(c.user?.login ?? '').toLowerCase() !== myLogin)
              .filter((c) => !since || String(c.created_at) > String(since))
              .slice(-3)
              .map(mapComment)
          }
        } catch {
          /* subject unreadable (deleted / no access): keep un-enriched */
        }
      }
      return item
    })
    return items.filter((x): x is ForgeInboxItem => !!x)
  },

  async markNotificationRead(threadId, opts): Promise<void> {
    await $fetch(`${API}/notifications/threads/${threadId}`, {
      method: 'PATCH',
      headers: ghHeaders(opts),
      signal: opts?.signal
    }).catch(() => {})
  },

  async createComment(repo, id, body, opts): Promise<ForgeComment> {
    const c = await $fetch<GhCommentResponse>(
      `${API}/repos/${repo.owner}/${repo.name}/issues/${id}/comments`,
      {
        method: 'POST',
        headers: ghHeaders(opts),
        body: { body },
        signal: opts?.signal
      }
    )
    return mapComment(c)
  },

  async createReview(repo, id, input, opts): Promise<void> {
    const body: Record<string, unknown> = { event: input.event }
    if (input.body) body.body = input.body
    if (input.comments?.length) {
      body.comments = input.comments.map((c) => ({
        path: c.path,
        line: c.line,
        side: 'RIGHT',
        ...(c.startLine ? { start_line: c.startLine, start_side: 'RIGHT' } : {}),
        body: c.body
      }))
    }
    await $fetch(`${API}/repos/${repo.owner}/${repo.name}/pulls/${id}/reviews`, {
      method: 'POST',
      headers: ghHeaders(opts),
      body,
      signal: opts?.signal
    })
  },

  async addReaction(repo, target, kind, opts): Promise<void> {
    if (target.kind === 'discussion') {
      const subjectId =
        target.commentId ?? (await ghDiscussionNodeId(repo, Number(target.threadId), opts))
      if (!subjectId) return
      await ghGraphql(
        `mutation($id:ID!,$content:ReactionContent!){ addReaction(input:{subjectId:$id,content:$content}){ clientMutationId } }`,
        { id: subjectId, content: GH_REACTION_GRAPHQL[kind] },
        opts
      )
      return
    }
    await $fetch(`${API}${ghReactionsPath(repo, target)}`, {
      method: 'POST',
      headers: ghHeaders(opts),
      body: { content: GH_REACTION_CONTENT[kind] },
      signal: opts?.signal
    })
  },

  async removeReaction(repo, target, kind, opts): Promise<void> {
    if (target.kind === 'discussion') {
      const subjectId =
        target.commentId ?? (await ghDiscussionNodeId(repo, Number(target.threadId), opts))
      if (!subjectId) return
      await ghGraphql(
        `mutation($id:ID!,$content:ReactionContent!){ removeReaction(input:{subjectId:$id,content:$content}){ clientMutationId } }`,
        { id: subjectId, content: GH_REACTION_GRAPHQL[kind] },
        opts
      )
      return
    }
    const login = await ghCurrentLogin(opts)
    const path = ghReactionsPath(repo, target)
    const list = await $fetch<{ id: number; user?: { login?: string } }[]>(`${API}${path}`, {
      headers: ghHeaders(opts),
      query: { content: GH_REACTION_CONTENT[kind], per_page: 100 },
      signal: opts?.signal
    })
    const mine = list.find((r) => r.user?.login === login)
    if (!mine) return
    try {
      await $fetch(`${API}${path}/${mine.id}`, {
        method: 'DELETE',
        headers: ghHeaders(opts),
        signal: opts?.signal
      })
    } catch (e) {
      // Already gone (e.g. removed elsewhere since the list above was fetched) — not an error.
      if (errStatus(e) !== 404) throw e
    }
  },

  async mergePull(repo, id, opts): Promise<ForgeMergeResult> {
    const methods = opts?.method ? [opts.method] : (['squash', 'merge', 'rebase'] as const)
    let lastErr: unknown
    for (const method of methods) {
      try {
        const r = await $fetch<GhMergeResultResponse>(
          `${API}/repos/${repo.owner}/${repo.name}/pulls/${id}/merge`,
          {
            method: 'PUT',
            headers: ghHeaders(opts),
            body: { merge_method: method },
            signal: opts?.signal
          }
        )
        return { merged: !!r.merged, message: r.message }
      } catch (e) {
        lastErr = e
        // 405 = this merge method is disabled on the repo; try the next one.
        // Anything else (409 conflict, 403 perms) is terminal.
        if (errStatus(e) !== 405) break
      }
    }
    throw lastErr
  },

  async isStarred(repo, opts): Promise<boolean> {
    const token = opts?.token ?? getForgeToken('github')
    if (!token) return false
    try {
      await $fetch(`${API}/user/starred/${repo.owner}/${repo.name}`, {
        headers: ghHeaders(opts),
        signal: opts?.signal
      })
      return true
    } catch (e) {
      if (errStatus(e) === 404) return false
      throw e
    }
  },

  async setStar(repo, starred, opts): Promise<{ starred: boolean }> {
    await $fetch(`${API}/user/starred/${repo.owner}/${repo.name}`, {
      method: starred ? 'PUT' : 'DELETE',
      headers: ghHeaders(opts),
      signal: opts?.signal
    })
    return { starred }
  },

  async listFollowedRepos(opts): Promise<ForgeRepo[]> {
    const token = opts?.token ?? getForgeToken('github')
    if (!token) return []
    const headers = ghHeaders(opts)
    // Only people, not orgs: /user/following mixes in Organization accounts.
    const following = await $fetch<GhUserResponse[]>(`${API}/user/following`, {
      headers,
      query: { per_page: 100 },
      signal: opts?.signal
    }).catch(() => [])
    const owners = following.filter((u) => String(u.type) === 'User').map((u) => String(u.login))
    const perOwner = await Promise.all(
      owners.slice(0, 20).map(async (login) => {
        try {
          const data = await $fetch<GhRepoResponse[]>(`${API}/users/${login}/repos`, {
            headers,
            query: { per_page: 5, sort: 'pushed', type: 'owner' },
            signal: opts?.signal
          })
          return (data ?? []).map(mapRepo)
        } catch {
          return [] as ForgeRepo[]
        }
      })
    )
    const seen = new Set<string>()
    return perOwner
      .flat()
      .filter((r) => !r.isFork && !r.isPrivate)
      .filter((r) => (seen.has(r.fullName) ? false : (seen.add(r.fullName), true)))
      .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))
  },

  async listFollowing(opts): Promise<ForgeUser[]> {
    const token = opts?.token ?? getForgeToken('github')
    if (!token) return []
    const data = await $fetch<GhUserResponse[]>(`${API}/user/following`, {
      headers: ghHeaders(opts),
      query: { per_page: opts?.limit ?? 100 },
      signal: opts?.signal
    }).catch(() => [])
    return (data ?? [])
      .filter((u) => String(u.type) === 'User')
      .map((u) => mapUser(u))
      .filter((u): u is ForgeUser => !!u)
  },

  async listUserFollowing(login, opts): Promise<ForgeUser[]> {
    const data = await cachedFetch<GhUserResponse[]>(
      `${API}/users/${encodeURIComponent(login)}/following`,
      { per_page: opts?.limit ?? 100 },
      {
        token: opts?.token ?? getForgeToken('github'),
        headers: ghHeaders(opts),
        proxyPath: '/api/graph-proxy',
        signal: opts?.signal
      }
    ).catch(() => [])
    return (data ?? [])
      .filter((u) => String(u.type) === 'User')
      .map((u) => mapUser(u))
      .filter((u): u is ForgeUser => !!u)
  },

  async listUserFollowers(login, opts): Promise<ForgeUser[]> {
    const data = await cachedFetch<GhUserResponse[]>(
      `${API}/users/${encodeURIComponent(login)}/followers`,
      { per_page: opts?.limit ?? 100 },
      {
        token: opts?.token ?? getForgeToken('github'),
        headers: ghHeaders(opts),
        proxyPath: '/api/graph-proxy',
        signal: opts?.signal
      }
    ).catch(() => [])
    return (data ?? [])
      .filter((u) => String(u.type) === 'User')
      .map((u) => mapUser(u))
      .filter((u): u is ForgeUser => !!u)
  },

  async listContributors(repo, opts): Promise<ForgeUser[]> {
    const data = await cachedFetch<GhUserResponse[]>(
      `${API}/repos/${repo.owner}/${repo.name}/contributors`,
      { per_page: opts?.limit ?? 20, anon: false },
      {
        token: opts?.token ?? getForgeToken('github'),
        headers: ghHeaders(opts),
        proxyPath: '/api/graph-proxy',
        signal: opts?.signal
      }
    ).catch(() => [])
    return (data ?? [])
      .filter((u) => String(u.type) === 'User' && u.login)
      .map((u) => mapUser(u))
      .filter((u): u is ForgeUser => !!u)
  },

  async listUserEvents(login, opts): Promise<ForgeContribution[]> {
    const data = await $fetch<GhEventResponse[]>(
      `${API}/users/${encodeURIComponent(login)}/events`,
      {
        headers: ghHeaders(opts),
        query: { per_page: Math.min(opts?.limit ?? 100, 100) },
        signal: opts?.signal
      }
    ).catch(() => [])
    return (data ?? []).map(mapEvent).filter((c): c is ForgeContribution => !!c)
  },

  async listMyWork(opts): Promise<ForgeMyWork> {
    const token = opts?.token ?? getForgeToken('github')
    if (!token) return { authoredPulls: [], reviewRequests: [], assignedIssues: [] }
    const run = (q: string): Promise<ForgeIssue[]> =>
      githubProvider.searchIssues!(q, { token, sort: 'updated', order: 'desc', limit: 8 })
        .then((r) => r.items)
        .catch(() => [] as ForgeIssue[])
    const [authoredPulls, reviewRequests, assignedIssues] = await Promise.all([
      run('is:open is:pr author:@me archived:false'),
      run('is:open is:pr review-requested:@me archived:false'),
      run('is:open is:issue assignee:@me archived:false')
    ])
    return { authoredPulls, reviewRequests, assignedIssues }
  }
}
