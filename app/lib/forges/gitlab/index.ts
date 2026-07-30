import type {
  ForgeBranch,
  ForgeBlob,
  ForgeCommitDetail,
  ForgeComment,
  ForgeContribution,
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
import { parseGitlabJobTrace } from '~/lib/forges/actions-log'
import { cachedFetch } from '~/lib/forges/cached-fetch'
import { deriveContributorsFromCommits } from '~/lib/forges/derive-contributors'
import type {
  GlAwardEmojiResponse,
  GlBlobSearchResponse,
  GlBranchResponse,
  GlCommitResponse,
  GlDiffResponse,
  GlEventResponse,
  GlFileResponse,
  GlIssueResponse,
  GlJobResponse,
  GlMergeRequestChangesResponse,
  GlMergeRequestResponse,
  GlMergeTrainCarResponse,
  GlNoteResponse,
  GlPipelineResponse,
  GlProjectResponse,
  GlStarrerResponse,
  GlTodoResponse,
  GlTodoTargetResponse,
  GlTreeItemResponse,
  GlUserResponse
} from './types'
import {
  botKindOf,
  decodeBase64Utf8,
  GL_REACTION_NAME,
  looksBinary,
  mapAwards,
  mapCommit,
  mapDiff,
  mapEvent,
  mapIssue,
  mapJob,
  mapNote,
  mapPipeline,
  mapPull,
  mapRepo,
  mapTodoReason,
  mapUser,
  mrState,
  projectBaseOf,
  sortEntries,
  todoKind,
  todoRepo,
  todoRoute,
  workItem
} from './mappers'

// GitLab.com REST API v4. A self-managed host could be supported later by making
// this configurable; for now maintainers.space targets gitlab.com like it targets github.com.
const API = 'https://gitlab.com/api/v4'
const WEB = 'https://gitlab.com'

function glHeaders(opts?: ForgeReadOptions): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = opts?.token ?? getForgeToken('gitlab')
  if (token) headers.Authorization = 'Bearer ' + token
  return headers
}

/** URL-encoded `namespace/project` path, or the cached numeric id when we have one. */
function projectId(repo: RepoLocator): string {
  const id = repo.ref?.id
  if (id != null) return String(id)
  return encodeURIComponent(`${repo.owner}/${repo.name}`)
}

function enc(v: string): string {
  return encodeURIComponent(v)
}

const glUsernameCache = new Map<string, string>()

/** Award emoji deletion needs the viewer's own award id; GitLab has no "is this mine" field otherwise. */
async function glCurrentUsername(opts?: ForgeReadOptions): Promise<string | null> {
  const token = opts?.token ?? getForgeToken('gitlab')
  if (!token) return null
  const cached = glUsernameCache.get(token)
  if (cached) return cached
  const user = await glFetch<GlUserResponse>('/user', undefined, opts).catch(() => null)
  if (user?.username) glUsernameCache.set(token, user.username)
  return user?.username ?? null
}

function glAwardPath(repo: RepoLocator, target: ForgeReactionTarget): string {
  const thread = target.kind === 'pull' ? 'merge_requests' : 'issues'
  const root = `/projects/${projectId(repo)}/${thread}/${target.threadId}`
  return target.commentId ? `${root}/notes/${target.commentId}/award_emoji` : `${root}/award_emoji`
}

/** Bounded-concurrency map, mirroring the GitHub provider's fan-out helper. */
async function glMapLimit<T, R>(
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

function errStatus(e: unknown): number | undefined {
  if (!e || typeof e !== 'object') return undefined
  const err = e as { statusCode?: number; status?: number; response?: { status?: number } }
  return err.statusCode ?? err.status ?? err.response?.status
}

async function glFetch<T>(
  path: string,
  query?: Record<string, unknown>,
  opts?: ForgeReadOptions
): Promise<T> {
  return (await $fetch(`${API}${path}`, {
    headers: glHeaders(opts),
    query,
    signal: opts?.signal
  })) as T
}

/** Search-endpoint fetch: anonymous reads go through maintainers.space's cached proxy, token reads go straight to GitLab. */
async function glSearchFetch<T>(
  path: string,
  query: Record<string, unknown>,
  opts?: ForgeSearchOptions
): Promise<T> {
  const token = opts?.token ?? getForgeToken('gitlab')
  return cachedFetch<T>(`${API}${path}`, query, {
    token,
    headers: glHeaders({ ...opts, token }),
    noCache: opts?.noCache,
    signal: opts?.signal
  })
}

async function getReadme(
  id: string,
  ref: string,
  entries: ForgeTreeEntry[],
  opts?: ForgeReadOptions
) {
  const readme = entries.find((e) => e.type === 'file' && /^readme(\.[a-z]+)?$/i.test(e.name))
  if (!readme) return null
  try {
    const raw = await $fetch<string>(
      `${API}/projects/${id}/repository/files/${enc(readme.path)}/raw`,
      {
        headers: glHeaders(opts),
        query: { ref },
        signal: opts?.signal,
        responseType: 'text'
      }
    )
    return { filename: readme.name, content: String(raw) }
  } catch {
    return null
  }
}

/** Resolve a username to a numeric GitLab user id (needed by the events API). */
const userIdCache = new Map<string, Promise<number | null>>()
function resolveUserId(login: string, opts?: ForgeReadOptions): Promise<number | null> {
  const hit = userIdCache.get(login)
  if (hit) return hit
  const p = glFetch<GlUserResponse[]>(`/users`, { username: login }, opts)
    .then((list) => list?.[0]?.id ?? null)
    .catch(() => null)
  userIdCache.set(login, p)
  return p
}

export const gitlabProvider: ForgeProvider = {
  id: 'gitlab',
  label: 'GitLab',
  icon: 'i-simple-icons-gitlab',
  color: '#fc6d26',
  dominance: 4,
  ownerLabel: 'Owner',
  ownerPlaceholder: 'e.g. gitlab-org',
  repoPlaceholder: 'e.g. gitlab',
  capabilities: {
    code: true,
    issues: true,
    pulls: true,
    discussions: false,
    actions: true,
    repoSearch: true,
    issueSearch: true,
    codeSearch: true,
    userSearch: true,
    discussionSearch: false,
    star: true,
    mergeQueue: true,
    reactions: true
  },
  webUrl: (owner, repo) => `${WEB}/${owner}/${repo}`,
  ownerWebUrl: (owner) => `${WEB}/${owner}`,

  async getRepo(owner, repo, opts) {
    return mapRepo(
      await glFetch<GlProjectResponse>(
        `/projects/${enc(`${owner}/${repo}`)}`,
        { license: true },
        opts
      )
    )
  },

  async getOverview(owner, repo, opts) {
    const meta = mapRepo(
      await glFetch<GlProjectResponse>(
        `/projects/${enc(`${owner}/${repo}`)}`,
        { license: true },
        opts
      )
    )
    const id = String(meta.ref?.id ?? enc(`${owner}/${repo}`))
    const [tree, languages] = await Promise.all([
      glFetch<GlTreeItemResponse[]>(
        `/projects/${id}/repository/tree`,
        { ref: meta.defaultBranch, per_page: 100 },
        opts
      ).catch(() => [] as GlTreeItemResponse[]),
      glFetch<Record<string, number>>(`/projects/${id}/languages`, undefined, opts).catch(
        () => ({})
      )
    ])
    const entries = (tree ?? [])
      .map(
        (e): ForgeTreeEntry => ({
          name: e.name,
          path: e.path,
          type: e.type === 'tree' ? 'dir' : 'file',
          sha: e.id
        })
      )
      .sort(sortEntries)
    const topLang = Object.entries(languages ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0]
    if (topLang) meta.language = topLang
    const readme = await getReadme(id, meta.defaultBranch, entries, opts)
    return { repo: meta, entries, readme }
  },

  async listRepos(owner, opts) {
    const query = { per_page: 60, order_by: 'last_activity_at', sort: 'desc' }
    let data: GlProjectResponse[]
    try {
      data = await glFetch<GlProjectResponse[]>(`/users/${enc(owner)}/projects`, query, opts)
    } catch {
      data = await glFetch<GlProjectResponse[]>(
        `/groups/${enc(owner)}/projects`,
        { ...query, include_subgroups: false },
        opts
      ).catch(() => [])
    }
    return (data ?? []).map(mapRepo)
  },

  async listBranches(repo, opts) {
    const data = await glFetch<GlBranchResponse[]>(
      `/projects/${projectId(repo)}/repository/branches`,
      { per_page: 100 },
      opts
    )
    return (data ?? []).map(
      (b): ForgeBranch => ({ name: b.name, isDefault: b.default, commit: { sha: b.commit?.id } })
    )
  },

  async getTree(repo, ref, path, opts) {
    const data = await glFetch<GlTreeItemResponse[]>(
      `/projects/${projectId(repo)}/repository/tree`,
      { ref, path, per_page: 100 },
      opts
    )
    return (data ?? [])
      .map(
        (e): ForgeTreeEntry => ({
          name: e.name,
          path: e.path,
          type: e.type === 'tree' ? 'dir' : 'file',
          sha: e.id
        })
      )
      .sort(sortEntries)
  },

  async getBlob(repo, ref, path, opts) {
    const r = await glFetch<GlFileResponse>(
      `/projects/${projectId(repo)}/repository/files/${enc(path)}`,
      { ref },
      opts
    )
    const b64: string = r.content ?? ''
    const binary = looksBinary(b64)
    return {
      path: r.file_path ?? path,
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
    const data = await glFetch<GlCommitResponse[]>(
      `/projects/${projectId(repo)}/repository/commits`,
      { ref_name: ref, per_page: limit, page },
      opts
    )
    const items = (data ?? []).map(mapCommit)
    return { items, cursor: items.length === limit ? String(page + 1) : undefined }
  },

  async getCommit(repo, sha, opts) {
    const id = projectId(repo)
    const [c, diff] = await Promise.all([
      glFetch<GlCommitResponse>(`/projects/${id}/repository/commits/${sha}`, undefined, opts),
      glFetch<GlDiffResponse[]>(
        `/projects/${id}/repository/commits/${sha}/diff`,
        { per_page: 100 },
        opts
      ).catch(() => [])
    ])
    const base = mapCommit(c)
    return {
      ...base,
      stat: {
        additions: c.stats?.additions,
        deletions: c.stats?.deletions,
        filesChanged: (diff ?? []).length
      },
      files: (diff ?? []).map(mapDiff)
    } satisfies ForgeCommitDetail
  },

  async listIssues(repo, opts) {
    const limit = opts?.limit ?? 30
    const page = opts?.cursor ? Number(opts.cursor) : 1
    const state =
      opts?.state === 'open' ? 'opened' : opts?.state === 'closed' ? 'closed' : undefined
    const data = await glFetch<GlIssueResponse[]>(
      `/projects/${projectId(repo)}/issues`,
      {
        state,
        per_page: limit,
        page,
        order_by: 'updated_at',
        sort: 'desc'
      },
      opts
    )
    return {
      items: (data ?? []).map(mapIssue),
      cursor: (data ?? []).length === limit ? String(page + 1) : undefined
    }
  },

  async getIssue(repo, id, opts): Promise<ForgeIssueDetail> {
    const pid = projectId(repo)
    const [issue, notes, awards, myUsername] = await Promise.all([
      glFetch<GlIssueResponse>(`/projects/${pid}/issues/${id}`, undefined, opts),
      glFetch<GlNoteResponse[]>(
        `/projects/${pid}/issues/${id}/notes`,
        { per_page: 100, sort: 'asc', order_by: 'created_at' },
        opts
      ).catch(() => []),
      glFetch<GlAwardEmojiResponse[]>(
        `/projects/${pid}/issues/${id}/award_emoji`,
        undefined,
        opts
      ).catch(() => []),
      glCurrentUsername(opts)
    ])
    return {
      ...mapIssue(issue),
      comments: (notes ?? [])
        .filter((n) => !n.system)
        .map((n) => mapNote(n, projectBaseOf(issue.web_url))),
      reactions: mapAwards(awards ?? [], myUsername)
    }
  },

  async listPulls(repo, opts) {
    const limit = opts?.limit ?? 30
    const page = opts?.cursor ? Number(opts.cursor) : 1
    const state =
      opts?.state === 'open'
        ? 'opened'
        : opts?.state === 'merged'
          ? 'merged'
          : opts?.state === 'closed'
            ? 'closed'
            : opts?.state === 'draft'
              ? 'opened'
              : undefined
    const data = await glFetch<GlMergeRequestResponse[]>(
      `/projects/${projectId(repo)}/merge_requests`,
      {
        state,
        per_page: limit,
        page,
        order_by: 'updated_at',
        sort: 'desc'
      },
      opts
    )
    let items = (data ?? []).map(mapPull)
    if (opts?.state === 'draft') items = items.filter((p) => p.state === 'draft')
    if (opts?.state === 'closed') items = items.filter((p) => p.state === 'closed')
    return { items, cursor: (data ?? []).length === limit ? String(page + 1) : undefined }
  },

  async getPull(repo, id, opts): Promise<ForgePullDetail> {
    const pid = projectId(repo)
    const [mr, notes, awards, myUsername] = await Promise.all([
      glFetch<GlMergeRequestResponse>(`/projects/${pid}/merge_requests/${id}`, undefined, opts),
      glFetch<GlNoteResponse[]>(
        `/projects/${pid}/merge_requests/${id}/notes`,
        { per_page: 100, sort: 'asc', order_by: 'created_at' },
        opts
      ).catch(() => []),
      glFetch<GlAwardEmojiResponse[]>(
        `/projects/${pid}/merge_requests/${id}/award_emoji`,
        undefined,
        opts
      ).catch(() => []),
      glCurrentUsername(opts)
    ])
    let stat: ForgePullDetail['stat']
    if (mr.changes_count != null) {
      stat = { filesChanged: Number(String(mr.changes_count).replace('+', '')) || undefined }
    }
    return {
      ...mapPull(mr),
      stat,
      comments: (notes ?? [])
        .filter((n) => !n.system)
        .map((n) => mapNote(n, projectBaseOf(mr.web_url))),
      reactions: mapAwards(awards ?? [], myUsername)
    }
  },

  async getPullFiles(repo, id, opts) {
    const pid = projectId(repo)
    const data = await glFetch<GlMergeRequestChangesResponse>(
      `/projects/${pid}/merge_requests/${id}/changes`,
      undefined,
      opts
    ).catch(() => null)
    const changes = data?.changes ?? []
    return changes.map(mapDiff)
  },

  async getPullCommits(repo, id, opts) {
    const data = await glFetch<GlCommitResponse[]>(
      `/projects/${projectId(repo)}/merge_requests/${id}/commits`,
      { per_page: 100 },
      opts
    )
    return (data ?? []).map(mapCommit)
  },

  async getMergeQueue(repo, branch, opts): Promise<ForgeMergeQueueStats | null> {
    const pid = projectId(repo)
    const path = branch
      ? `/projects/${pid}/merge_trains/${enc(branch)}`
      : `/projects/${pid}/merge_trains`
    let cars: GlMergeTrainCarResponse[]
    try {
      cars = await glFetch<GlMergeTrainCarResponse[]>(path, { scope: 'active', per_page: 50 }, opts)
    } catch {
      return null
    }
    let list = (cars ?? []).filter(Boolean)
    if (!list.length) return null
    // The branch-less endpoint mixes every train; a train is per target branch,
    // so collapse to the busiest branch to present a single coherent queue.
    const target = branch ?? list[0]?.target_branch
    if (target) list = list.filter((c) => (c.target_branch ?? target) === target)
    const entries: ForgeMergeQueueEntry[] = list.map((c, i) => {
      const mr = c.merge_request ?? {}
      return {
        position: i + 1,
        number: mr.iid,
        title: mr.title ?? '',
        author: mapUser(mr.author ?? c.user),
        status: c.status ?? undefined,
        enqueuedAt: c.created_at ?? null,
        url: mr.web_url ?? null,
        ref: mr.iid != null ? { iid: mr.iid } : undefined
      }
    })
    if (!entries.length) return null
    return { branch: target ?? '', kind: 'train', entries }
  },

  async listActionRuns(repo, opts) {
    const limit = opts?.limit ?? 30
    const page = opts?.cursor ? Number(opts.cursor) : 1
    const data = await glFetch<GlPipelineResponse[]>(
      `/projects/${projectId(repo)}/pipelines`,
      {
        per_page: limit,
        page,
        order_by: 'id',
        sort: 'desc'
      },
      opts
    ).catch(() => [])
    const items = (data ?? []).map(mapPipeline)
    return { items, cursor: items.length === limit ? String(page + 1) : undefined }
  },

  async getActionRun(repo, id, opts) {
    const pid = projectId(repo)
    const [run, jobs] = await Promise.all([
      glFetch<GlPipelineResponse>(`/projects/${pid}/pipelines/${id}`, undefined, opts),
      glFetch<GlJobResponse[]>(
        `/projects/${pid}/pipelines/${id}/jobs`,
        { per_page: 100 },
        opts
      ).catch(() => [])
    ])
    return { ...mapPipeline(run), jobs: (jobs ?? []).map(mapJob) }
  },

  async getActionJobLog(repo, jobId, opts): Promise<ForgeJobLog | null> {
    try {
      const text = await $fetch<string>(`${API}/projects/${projectId(repo)}/jobs/${jobId}/trace`, {
        headers: glHeaders(opts),
        responseType: 'text',
        signal: opts?.signal
      })
      return parseGitlabJobTrace(text)
    } catch {
      return null
    }
  },

  async searchRepos(q, opts): Promise<Paginated<ForgeRepo>> {
    const page = opts?.cursor ? Number(opts.cursor) : 1
    const perPage = opts?.limit ?? 20
    const order =
      opts?.sort === 'stars'
        ? 'star_count'
        : opts?.sort === 'created'
          ? 'created_at'
          : opts?.sort === 'updated'
            ? 'updated_at'
            : undefined
    const data = await glSearchFetch<GlProjectResponse[]>(
      `/projects`,
      {
        search: q,
        per_page: perPage,
        page,
        order_by: order ?? 'star_count',
        sort: opts?.order ?? 'desc'
      },
      opts
    )
    const items = (data ?? []).map(mapRepo)
    return { items, cursor: items.length === perPage ? String(page + 1) : undefined }
  },

  async searchIssues(q, opts): Promise<Paginated<ForgeIssue>> {
    // Global issue search requires authentication on gitlab.com.
    if (!(opts?.token ?? getForgeToken('gitlab'))) return { items: [], incomplete: true }
    const page = opts?.cursor ? Number(opts.cursor) : 1
    const perPage = opts?.limit ?? 20
    const data = await glFetch<GlIssueResponse[]>(
      `/search`,
      { scope: 'issues', search: q, per_page: perPage, page },
      opts
    ).catch(() => [])
    const items = (data ?? []).map((r) => {
      const issue = mapIssue(r)
      // Global results carry project_id but not the path; the web_url still routes.
      issue.url = r.web_url
      return issue
    })
    return { items, cursor: items.length === perPage ? String(page + 1) : undefined }
  },

  async searchCode(q, opts): Promise<Paginated<ForgeSearchCode>> {
    if (!(opts?.token ?? getForgeToken('gitlab'))) return { items: [], incomplete: true }
    const page = opts?.cursor ? Number(opts.cursor) : 1
    const perPage = opts?.limit ?? 20
    const data = await glFetch<GlBlobSearchResponse[]>(
      `/search`,
      { scope: 'blobs', search: q, per_page: perPage, page },
      opts
    ).catch(() => [])
    const items = (data ?? []).map(
      (r): ForgeSearchCode => ({
        provider: 'gitlab',
        repo: { owner: '', name: '', fullName: String(r.project_id ?? ''), url: undefined },
        path: r.path ?? r.filename ?? '',
        url: undefined,
        fragments: r.data ? [String(r.data)] : []
      })
    )
    return { items, cursor: items.length === perPage ? String(page + 1) : undefined }
  },

  async searchUsers(q, opts): Promise<Paginated<ForgeUser>> {
    const page = opts?.cursor ? Number(opts.cursor) : 1
    const perPage = opts?.limit ?? 20
    const data = await glSearchFetch<GlUserResponse[]>(
      `/users`,
      { search: q, per_page: perPage, page },
      opts
    ).catch(() => [])
    const items = (data ?? []).map(mapUser).filter((u): u is ForgeUser => !!u)
    return { items, cursor: items.length === perPage ? String(page + 1) : undefined }
  },

  async listNotifications(opts): Promise<ForgeNotification[]> {
    if (!(opts?.token ?? getForgeToken('gitlab'))) return []
    const todos = await glFetch<GlTodoResponse[]>(
      `/todos`,
      { per_page: opts?.limit ?? 30, state: 'pending' },
      opts
    ).catch(() => [])
    return (todos ?? []).map((t): ForgeNotification => {
      const kind = todoKind(t)
      const { owner, name, fullName } = todoRepo(t)
      return {
        provider: 'gitlab',
        id: String(t.id),
        kind,
        title: t.target?.title ?? t.body ?? '(todo)',
        reason: t.action_name,
        unread: t.state === 'pending',
        updatedAt: t.updated_at ?? t.created_at,
        repo: fullName ? { owner, name, fullName } : undefined,
        to: todoRoute(t, kind, owner, name),
        url: t.target_url
      }
    })
  },

  async listInbox(opts): Promise<ForgeInboxItem[]> {
    const token = opts?.token ?? getForgeToken('gitlab')
    if (!token) return []
    const [todos, me] = await Promise.all([
      glFetch<GlTodoResponse[]>(
        `/todos`,
        { per_page: opts?.limit ?? 50, state: 'pending' },
        opts
      ).catch(() => []),
      glFetch<GlUserResponse>(`/user`, undefined, opts).catch(() => null)
    ])
    const myLogin = String(me?.username ?? '').toLowerCase()

    const items = await glMapLimit(todos ?? [], 6, async (t): Promise<ForgeInboxItem | null> => {
      const kind = todoKind(t)
      const { owner, name, fullName } = todoRepo(t)
      const number = t.target?.iid
      const item: ForgeInboxItem = {
        provider: 'gitlab',
        id: String(t.id),
        kind,
        title: t.target?.title ?? t.body ?? '(todo)',
        reason: mapTodoReason(t.action_name),
        unread: t.state === 'pending',
        updatedAt: t.updated_at ?? t.created_at,
        repo: fullName ? { owner, name, fullName } : undefined,
        to: todoRoute(t, kind, owner, name),
        url: t.target_url,
        number
      }
      const target: GlTodoTargetResponse = t.target ?? {}
      if (kind === 'pull' || kind === 'issue') {
        const st = mrState(target)
        item.state = kind === 'pull' ? st : target.state === 'closed' ? 'closed' : 'open'
        item.resolved =
          kind === 'pull' ? st === 'merged' || st === 'closed' : target.state === 'closed'
        item.author = mapUser(target.author)
        const bk = botKindOf(target.author?.username)
        item.isBot = !!bk
        item.botKind = bk
      } else if (kind === 'ci') {
        item.resolved = false
      }
      return item
    })
    return items
      .filter((x): x is ForgeInboxItem => !!x)
      .filter((i) => i.author?.login?.toLowerCase() !== myLogin || i.kind === 'ci')
  },

  async markNotificationRead(threadId, opts): Promise<void> {
    await glFetch(`/todos/${threadId}/mark_as_done`, undefined, { ...opts }).catch(() => {})
  },

  async createComment(repo, id, body, opts): Promise<ForgeComment> {
    const pid = projectId(repo)
    // The generic signature doesn't say issue vs MR; try MR first, fall back to issue.
    for (const kind of ['merge_requests', 'issues'] as const) {
      try {
        const note = await $fetch<GlNoteResponse>(`${API}/projects/${pid}/${kind}/${id}/notes`, {
          method: 'POST',
          headers: glHeaders(opts),
          body: { body },
          signal: opts?.signal
        })
        return mapNote(note)
      } catch (e) {
        if (errStatus(e) !== 404) throw e
      }
    }
    throw createError({
      statusCode: 404,
      statusMessage: 'Could not find the issue or merge request to comment on.'
    })
  },

  async createReview(repo, id, input, opts): Promise<void> {
    const pid = projectId(repo)
    if (input.event === 'APPROVE') {
      await $fetch(`${API}/projects/${pid}/merge_requests/${id}/approve`, {
        method: 'POST',
        headers: glHeaders(opts),
        signal: opts?.signal
      })
    }
    if (input.body) {
      await $fetch(`${API}/projects/${pid}/merge_requests/${id}/notes`, {
        method: 'POST',
        headers: glHeaders(opts),
        body: { body: input.body },
        signal: opts?.signal
      }).catch(() => {})
    }
  },

  async addReaction(repo, target, kind, opts): Promise<void> {
    await $fetch(`${API}${glAwardPath(repo, target)}`, {
      method: 'POST',
      headers: glHeaders(opts),
      body: { name: GL_REACTION_NAME[kind] },
      signal: opts?.signal
    })
  },

  async removeReaction(repo, target, kind, opts): Promise<void> {
    const username = await glCurrentUsername(opts)
    const path = glAwardPath(repo, target)
    const list = await $fetch<GlAwardEmojiResponse[]>(`${API}${path}`, {
      headers: glHeaders(opts),
      query: { per_page: 100 },
      signal: opts?.signal
    })
    const mine = list.find(
      (a) => a.name === GL_REACTION_NAME[kind] && a.user?.username === username
    )
    if (!mine) return
    try {
      await $fetch(`${API}${path}/${mine.id}`, {
        method: 'DELETE',
        headers: glHeaders(opts),
        signal: opts?.signal
      })
    } catch (e) {
      // Already gone (e.g. removed elsewhere since the list above was fetched) — not an error.
      if (errStatus(e) !== 404) throw e
    }
  },

  async mergePull(repo, id, opts): Promise<ForgeMergeResult> {
    const r = await $fetch<GlMergeRequestResponse>(
      `${API}/projects/${projectId(repo)}/merge_requests/${id}/merge`,
      {
        method: 'PUT',
        headers: glHeaders(opts),
        signal: opts?.signal
      }
    )
    return { merged: r.state === 'merged', message: r.merge_error ?? undefined }
  },

  async isStarred(repo, opts): Promise<boolean> {
    const token = opts?.token ?? getForgeToken('gitlab')
    if (!token) return false
    const me = await glFetch<GlUserResponse>('/user', undefined, opts).catch(() => null)
    if (!me?.id) return false
    const starrers = await glFetch<GlStarrerResponse[]>(
      `/projects/${projectId(repo)}/starrers`,
      { search: me.username },
      opts
    ).catch(() => [])
    return (starrers ?? []).some((s) => s?.user?.id === me.id)
  },

  async setStar(repo, starred, opts): Promise<{ starred: boolean; stars?: number }> {
    try {
      const proj = await $fetch<GlProjectResponse>(
        `${API}/projects/${projectId(repo)}/${starred ? 'star' : 'unstar'}`,
        {
          method: 'POST',
          headers: glHeaders(opts),
          signal: opts?.signal
        }
      )
      return { starred, stars: typeof proj?.star_count === 'number' ? proj.star_count : undefined }
    } catch (e) {
      // GitLab responds 304 Not Modified when the repo is already in the target state.
      if (errStatus(e) === 304) return { starred }
      throw e
    }
  },

  async listFollowedRepos(opts): Promise<ForgeRepo[]> {
    const token = opts?.token ?? getForgeToken('gitlab')
    if (!token) return []
    const me = await glFetch<GlUserResponse>(`/user`, undefined, opts).catch(() => null)
    if (!me?.id) return []
    const following = await glFetch<GlUserResponse[]>(
      `/users/${me.id}/following`,
      { per_page: 100 },
      opts
    ).catch(() => [])
    const perOwner = await glMapLimit((following ?? []).slice(0, 20), 6, async (u) => {
      try {
        const data = await glFetch<GlProjectResponse[]>(
          `/users/${u.id}/projects`,
          { per_page: 5, order_by: 'last_activity_at', sort: 'desc' },
          opts
        )
        return (data ?? []).map(mapRepo)
      } catch {
        return [] as ForgeRepo[]
      }
    })
    const seen = new Set<string>()
    return perOwner
      .flat()
      .filter((r) => !r.isFork && !r.isPrivate)
      .filter((r) => (seen.has(r.fullName) ? false : (seen.add(r.fullName), true)))
      .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))
  },

  async listFollowing(opts): Promise<ForgeUser[]> {
    const token = opts?.token ?? getForgeToken('gitlab')
    if (!token) return []
    const me = await glFetch<GlUserResponse>(`/user`, undefined, opts).catch(() => null)
    if (!me?.id) return []
    const data = await glFetch<GlUserResponse[]>(
      `/users/${me.id}/following`,
      { per_page: opts?.limit ?? 100 },
      opts
    ).catch(() => [])
    return (data ?? []).map(mapUser).filter((u): u is ForgeUser => !!u)
  },

  async listUserFollowing(login, opts): Promise<ForgeUser[]> {
    const uid = await resolveUserId(login, opts)
    if (uid == null) return []
    const data = await cachedFetch<GlUserResponse[]>(
      `${API}/users/${uid}/following`,
      { per_page: opts?.limit ?? 100 },
      {
        token: opts?.token ?? getForgeToken('gitlab'),
        headers: glHeaders(opts),
        proxyPath: '/api/graph-proxy',
        signal: opts?.signal
      }
    ).catch(() => [])
    return (data ?? []).map(mapUser).filter((u): u is ForgeUser => !!u)
  },

  async listUserFollowers(login, opts): Promise<ForgeUser[]> {
    const uid = await resolveUserId(login, opts)
    if (uid == null) return []
    const data = await cachedFetch<GlUserResponse[]>(
      `${API}/users/${uid}/followers`,
      { per_page: opts?.limit ?? 100 },
      {
        token: opts?.token ?? getForgeToken('gitlab'),
        headers: glHeaders(opts),
        proxyPath: '/api/graph-proxy',
        signal: opts?.signal
      }
    ).catch(() => [])
    return (data ?? []).map(mapUser).filter((u): u is ForgeUser => !!u)
  },

  async listContributors(repo, opts): Promise<ForgeUser[]> {
    return deriveContributorsFromCommits(
      'gitlab',
      () => gitlabProvider.getRepo!(repo.owner, repo.name, opts).then((r) => r.defaultBranch),
      (ref) => gitlabProvider.listCommits!(repo, ref, { ...opts, limit: 100 }),
      opts?.limit ?? 8
    )
  },

  async listUserEvents(login, opts): Promise<ForgeContribution[]> {
    const uid = await resolveUserId(login, opts)
    if (uid == null) return []
    const data = await glFetch<GlEventResponse[]>(
      `/users/${uid}/events`,
      { per_page: Math.min(opts?.limit ?? 100, 100) },
      opts
    ).catch(() => [])
    const projectIds = [...new Set((data ?? []).map((e) => e.project_id).filter(Boolean))]
    const projects = await glMapLimit(projectIds.slice(0, 25), 6, (pid) =>
      glFetch<GlProjectResponse>(`/projects/${pid}`, undefined, opts).catch(() => null)
    )
    const index = new Map<number, GlProjectResponse>()
    for (const p of projects) if (p?.id) index.set(p.id, p)
    return (data ?? []).map((e) => mapEvent(e, index)).filter((c): c is ForgeContribution => !!c)
  },

  async listMyWork(opts): Promise<ForgeMyWork> {
    const token = opts?.token ?? getForgeToken('gitlab')
    if (!token) return { authoredPulls: [], reviewRequests: [], assignedIssues: [] }
    const me = await glFetch<GlUserResponse>(`/user`, undefined, opts).catch(() => null)
    const base = { state: 'opened', order_by: 'updated_at', sort: 'desc', per_page: 8 }
    const [authored, reviews, assigned] = await Promise.all([
      glFetch<GlMergeRequestResponse[]>(
        `/merge_requests`,
        { ...base, scope: 'created_by_me' },
        opts
      ).catch(() => []),
      me?.username
        ? glFetch<GlMergeRequestResponse[]>(
            `/merge_requests`,
            { ...base, scope: 'all', reviewer_username: me.username },
            opts
          ).catch(() => [])
        : Promise.resolve([] as GlMergeRequestResponse[]),
      glFetch<GlIssueResponse[]>(`/issues`, { ...base, scope: 'assigned_to_me' }, opts).catch(
        () => []
      )
    ])
    return {
      authoredPulls: (authored ?? []).map((r) => workItem(r, true)),
      reviewRequests: (reviews ?? []).map((r) => workItem(r, true)),
      assignedIssues: (assigned ?? []).map((r) => workItem(r, false))
    }
  }
}
