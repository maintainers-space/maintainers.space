import type {
  ForgeActionJob,
  ForgeBranch,
  ForgeBlob,
  ForgeCommitDetail,
  ForgeComment,
  ForgeContribution,
  ForgeId,
  ForgeInboxItem,
  ForgeIssueDetail,
  ForgeJobLog,
  ForgeMergeResult,
  ForgeMyWork,
  ForgeNotification,
  ForgePullDetail,
  ForgeProvider,
  ForgeReactionTarget,
  ForgeReadOptions,
  ForgeRepo,
  ForgeSearchOptions,
  ForgeTreeEntry,
  ForgeUser,
  Paginated,
  RepoLocator
} from '~/types/forge'

import { getForgeToken } from '~/lib/forges/token-store'
import { parseActionsRunnerLog } from '~/lib/forges/actions-log'
import { cachedFetch } from '~/lib/forges/cached-fetch'
import { deriveContributorsFromCommits } from '~/lib/forges/derive-contributors'
import type {
  GfActionRunJobResponse,
  GfActionRunListResponse,
  GfActionRunResponse,
  GfActivityResponse,
  GfBranchResponse,
  GfCommentResponse,
  GfCommitResponse,
  GfContentResponse,
  GfFileDiffResponse,
  GfGitCommitResponse,
  GfIssueResponse,
  GfNotificationResponse,
  GfPullResponse,
  GfReactionResponse,
  GfRepoResponse,
  GfSearchIssueResponse,
  GfSearchReposResponse,
  GfSearchUsersResponse,
  GfTopicsResponse,
  GfUserResponse
} from './types'
import {
  botKindOf,
  createGiteaFamilyMappers,
  decodeBase64Utf8,
  GF_REACTION_CONTENT,
  looksBinary,
  mapActionJob,
  mapCommit,
  mapFileDiff,
  mapGfReactions,
  mapSort,
  notificationKind,
  notificationNumber,
  pullState,
  sortEntries,
  splitUnifiedDiff,
  topLanguage
} from './mappers'

/** Config for one Gitea-flavored instance (Gitea itself, or a fork like Forgejo). */
export interface GiteaFamilyConfig {
  id: ForgeId
  label: string
  icon: string
  color?: string
  /** See `ForgeProvider.dominance`. Defaults to 1 when omitted. */
  dominance?: number
  /** e.g. "https://codeberg.org/api/v1" */
  apiBase: string
  /** e.g. "https://codeberg.org" */
  webBase: string
  ownerLabel?: string
  ownerPlaceholder: string
  repoPlaceholder: string
}

/** Bounded-concurrency map so fan-out (following, inbox enrichment) stays responsive. */
async function mapLimit<T, R>(
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

function encodePath(path: string): string {
  return path.split('/').filter(Boolean).map(encodeURIComponent).join('/')
}

/** Build a `ForgeProvider` for any Gitea-flavored REST API (Gitea, Forgejo, ...). */
export function createGiteaFamilyProvider(config: GiteaFamilyConfig): ForgeProvider {
  const { id: providerId, apiBase: API, webBase: WEB } = config
  const gf = createGiteaFamilyMappers(providerId, WEB)

  function headers(opts?: ForgeReadOptions): Record<string, string> {
    const h: Record<string, string> = { Accept: 'application/json' }
    const token = opts?.token ?? getForgeToken(providerId)
    if (token) h.Authorization = 'Bearer ' + token
    return h
  }

  function contentUrl(owner: string, repo: string, path: string): string {
    const enc = encodePath(path)
    return enc
      ? `${API}/repos/${owner}/${repo}/contents/${enc}`
      : `${API}/repos/${owner}/${repo}/contents`
  }

  async function gfFetch<T>(
    path: string,
    query?: Record<string, unknown>,
    opts?: ForgeReadOptions
  ): Promise<T> {
    return (await $fetch(`${API}${path}`, {
      headers: headers(opts),
      query,
      signal: opts?.signal
    })) as T
  }

  /** Search-endpoint fetch: anonymous reads go through maintainers.space's cached proxy, token reads go straight to the forge. */
  async function gfSearchFetch<T>(
    path: string,
    query: Record<string, unknown>,
    opts?: ForgeSearchOptions
  ): Promise<T> {
    const token = opts?.token ?? getForgeToken(providerId)
    return cachedFetch<T>(`${API}${path}`, query, {
      token,
      headers: headers({ ...opts, token }),
      noCache: opts?.noCache,
      signal: opts?.signal
    })
  }

  const reactionLoginCache = new Map<string, string>()

  /** Only used to compute `viewerReacted` for display — Gitea's own delete-reaction call needs no id. */
  async function gfCurrentLogin(opts?: ForgeReadOptions): Promise<string | null> {
    const token = opts?.token ?? getForgeToken(providerId)
    if (!token) return null
    const cached = reactionLoginCache.get(token)
    if (cached) return cached
    const me = await gfFetch<GfUserResponse | null>('/user', undefined, opts).catch(() => null)
    const login = me?.login ?? me?.username ?? ''
    if (login) reactionLoginCache.set(token, login)
    return login || null
  }

  function gfReactionsPath(repo: RepoLocator, target: ForgeReactionTarget): string {
    const base = `/repos/${repo.owner}/${repo.name}`
    return target.commentId
      ? `${base}/issues/comments/${target.commentId}/reactions`
      : `${base}/issues/${target.threadId}/reactions`
  }

  async function getRootTree(
    owner: string,
    repo: string,
    ref: string | undefined,
    opts?: ForgeReadOptions
  ): Promise<ForgeTreeEntry[]> {
    const data = await $fetch<GfContentResponse | GfContentResponse[]>(
      contentUrl(owner, repo, ''),
      {
        headers: headers(opts),
        query: ref ? { ref } : undefined,
        signal: opts?.signal
      }
    )
    const arr = Array.isArray(data) ? data : [data]
    return arr
      .map(
        (e: GfContentResponse): ForgeTreeEntry => ({
          name: e.name ?? '',
          path: e.path ?? '',
          type: e.type === 'dir' ? 'dir' : 'file',
          size: e.size,
          sha: e.sha
        })
      )
      .sort(sortEntries)
  }

  async function getReadme(
    owner: string,
    repo: string,
    ref: string,
    entries: ForgeTreeEntry[],
    opts?: ForgeReadOptions
  ) {
    const readme = entries.find(
      (e) => e.type === 'file' && /^readme(\.(md|markdown|rst|txt|adoc))?$/i.test(e.name)
    )
    if (!readme) return null
    try {
      const r = await $fetch<GfContentResponse>(contentUrl(owner, repo, readme.path), {
        headers: headers(opts),
        query: { ref },
        signal: opts?.signal
      })
      return { filename: r.name ?? readme.name, content: decodeBase64Utf8(r.content ?? '') }
    } catch {
      return null
    }
  }

  const provider: ForgeProvider = {
    id: providerId,
    label: config.label,
    icon: config.icon,
    color: config.color,
    dominance: config.dominance,
    ownerLabel: config.ownerLabel ?? 'Owner',
    ownerPlaceholder: config.ownerPlaceholder,
    repoPlaceholder: config.repoPlaceholder,
    capabilities: {
      code: true,
      issues: true,
      pulls: true,
      discussions: false,
      actions: true,
      repoSearch: true,
      issueSearch: true,
      codeSearch: false,
      userSearch: true,
      discussionSearch: false,
      star: true,
      mergeQueue: false,
      reactions: true
    },
    webUrl: (owner, repo) => `${WEB}/${owner}/${repo}`,
    ownerWebUrl: (owner) => `${WEB}/${owner}`,

    async getRepo(owner, repo, opts) {
      const [raw, languages, topics] = await Promise.all([
        gfFetch<GfRepoResponse>(`/repos/${owner}/${repo}`, undefined, opts),
        gfFetch<Record<string, number>>(`/repos/${owner}/${repo}/languages`, undefined, opts).catch(
          () => null
        ),
        gfFetch<GfTopicsResponse>(`/repos/${owner}/${repo}/topics`, undefined, opts).catch(
          () => null
        )
      ])
      const mapped = gf.mapRepo(raw)
      mapped.language = topLanguage(languages)
      mapped.topics = raw.topics ?? topics?.topics ?? []
      return mapped
    },

    async getOverview(owner, repo, opts) {
      const meta = await provider.getRepo!(owner, repo, opts)
      const entries = await getRootTree(owner, repo, meta.defaultBranch, opts).catch(
        () => [] as ForgeTreeEntry[]
      )
      const readme = await getReadme(owner, repo, meta.defaultBranch, entries, opts)
      return { repo: meta, entries, readme }
    },

    async listRepos(owner, opts) {
      const data = await gfFetch<GfRepoResponse[]>(
        `/users/${owner}/repos`,
        { limit: 60, page: 1, sort: 'updated' },
        opts
      ).catch(() => [])
      return (data ?? []).map(gf.mapRepo)
    },

    async listBranches(repo, opts) {
      const data = await gfFetch<GfBranchResponse[]>(
        `/repos/${repo.owner}/${repo.name}/branches`,
        { limit: 100 },
        opts
      )
      return (data ?? []).map(
        (b): ForgeBranch => ({
          name: b.name,
          isDefault: b.name === repo.ref?.defaultBranch,
          commit: { sha: b.commit?.id, message: b.commit?.message, when: b.commit?.timestamp }
        })
      )
    },

    async getTree(repo, ref, path, opts) {
      const data = await $fetch<GfContentResponse | GfContentResponse[]>(
        contentUrl(repo.owner, repo.name, path),
        {
          headers: headers(opts),
          query: { ref },
          signal: opts?.signal
        }
      )
      const arr = Array.isArray(data) ? data : [data]
      return arr
        .map(
          (e: GfContentResponse): ForgeTreeEntry => ({
            name: e.name ?? '',
            path: e.path ?? '',
            type: e.type === 'dir' ? 'dir' : 'file',
            size: e.size,
            sha: e.sha
          })
        )
        .sort(sortEntries)
    },

    async getBlob(repo, ref, path, opts) {
      const r = await $fetch<GfContentResponse>(contentUrl(repo.owner, repo.name, path), {
        headers: headers(opts),
        query: { ref },
        signal: opts?.signal
      })
      const b64 = String(r.content ?? '')
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
      const data = await gfFetch<GfCommitResponse[]>(
        `/repos/${repo.owner}/${repo.name}/commits`,
        { sha: ref, page, limit },
        opts
      )
      const items = (data ?? []).map(mapCommit)
      return { items, cursor: items.length === limit ? String(page + 1) : undefined }
    },

    async getCommit(repo, sha, opts) {
      const [r, diffText] = await Promise.all([
        gfFetch<GfGitCommitResponse>(
          `/repos/${repo.owner}/${repo.name}/git/commits/${sha}`,
          { stat: true, files: true, verification: false },
          opts
        ),
        $fetch<string>(`${API}/repos/${repo.owner}/${repo.name}/git/commits/${sha}.diff`, {
          headers: headers(opts),
          signal: opts?.signal,
          responseType: 'text'
        }).catch(() => '')
      ])
      const patches = splitUnifiedDiff(diffText)
      const base = mapCommit(r)
      return {
        ...base,
        stat: {
          additions: r.stats?.additions,
          deletions: r.stats?.deletions,
          filesChanged: r.files?.length
        },
        files: (r.files ?? []).map((f: GfFileDiffResponse) =>
          mapFileDiff(f, patches[f.filename ?? ''] ?? null)
        )
      } satisfies ForgeCommitDetail
    },

    async listIssues(repo, opts) {
      const limit = opts?.limit ?? 30
      const page = opts?.cursor ? Number(opts.cursor) : 1
      const data = await gfFetch<GfIssueResponse[]>(
        `/repos/${repo.owner}/${repo.name}/issues`,
        {
          type: 'issues',
          state: opts?.state ?? 'open',
          page,
          limit
        },
        opts
      )
      const items = (data ?? []).map(gf.mapIssue)
      return { items, cursor: items.length === limit ? String(page + 1) : undefined }
    },

    async getIssue(repo, id, opts): Promise<ForgeIssueDetail> {
      const [issue, comments, reactions, myLogin] = await Promise.all([
        gfFetch<GfIssueResponse>(`/repos/${repo.owner}/${repo.name}/issues/${id}`, undefined, opts),
        gfFetch<GfCommentResponse[]>(
          `/repos/${repo.owner}/${repo.name}/issues/${id}/comments`,
          { limit: 100 },
          opts
        ).catch(() => []),
        gfFetch<GfReactionResponse[]>(
          `/repos/${repo.owner}/${repo.name}/issues/${id}/reactions`,
          undefined,
          opts
        ).catch(() => []),
        gfCurrentLogin(opts)
      ])
      return {
        ...gf.mapIssue(issue),
        comments: (comments ?? []).map(gf.mapComment),
        reactions: mapGfReactions(reactions ?? [], myLogin)
      }
    },

    async listPulls(repo, opts) {
      const limit = opts?.limit ?? 30
      const page = opts?.cursor ? Number(opts.cursor) : 1
      const state =
        opts?.state === 'merged' || opts?.state === 'draft' ? 'all' : (opts?.state ?? 'open')
      const data = await gfFetch<GfPullResponse[]>(
        `/repos/${repo.owner}/${repo.name}/pulls`,
        { state, page, limit },
        opts
      )
      let items = (data ?? []).map(gf.mapPull)
      if (opts?.state === 'merged') items = items.filter((p) => p.state === 'merged')
      if (opts?.state === 'draft') items = items.filter((p) => p.state === 'draft')
      if (opts?.state === 'closed') items = items.filter((p) => p.state === 'closed')
      return { items, cursor: (data ?? []).length === limit ? String(page + 1) : undefined }
    },

    async getPull(repo, id, opts): Promise<ForgePullDetail> {
      const [pr, comments, commits, reactions, myLogin] = await Promise.all([
        gfFetch<GfPullResponse>(`/repos/${repo.owner}/${repo.name}/pulls/${id}`, undefined, opts),
        gfFetch<GfCommentResponse[]>(
          `/repos/${repo.owner}/${repo.name}/issues/${id}/comments`,
          { limit: 100 },
          opts
        ).catch(() => []),
        gfFetch<GfCommitResponse[]>(
          `/repos/${repo.owner}/${repo.name}/pulls/${id}/commits`,
          { limit: 100 },
          opts
        ).catch(() => []),
        gfFetch<GfReactionResponse[]>(
          `/repos/${repo.owner}/${repo.name}/issues/${id}/reactions`,
          undefined,
          opts
        ).catch(() => []),
        gfCurrentLogin(opts)
      ])
      return {
        ...gf.mapPull(pr),
        stat: { additions: pr.additions, deletions: pr.deletions, filesChanged: pr.changed_files },
        commitCount: pr.commits ?? commits.length,
        comments: (comments ?? []).map(gf.mapComment),
        reactions: mapGfReactions(reactions ?? [], myLogin)
      }
    },

    async getPullFiles(repo, id, opts) {
      const data = await gfFetch<GfFileDiffResponse[]>(
        `/repos/${repo.owner}/${repo.name}/pulls/${id}/files`,
        { limit: 100 },
        opts
      )
      return (data ?? []).map((f: GfFileDiffResponse) => mapFileDiff(f))
    },

    async getPullCommits(repo, id, opts) {
      const data = await gfFetch<GfCommitResponse[]>(
        `/repos/${repo.owner}/${repo.name}/pulls/${id}/commits`,
        { limit: 100 },
        opts
      )
      return (data ?? []).map(mapCommit)
    },

    async listActionRuns(repo, opts) {
      const limit = opts?.limit ?? 30
      const page = opts?.cursor ? Number(opts.cursor) : 1
      try {
        const data = await gfFetch<GfActionRunListResponse>(
          `/repos/${repo.owner}/${repo.name}/actions/runs`,
          { limit, page },
          opts
        )
        const items = (data.entries ?? []).map(gf.mapActionRun)
        return {
          items,
          cursor: items.length === limit ? String(page + 1) : undefined,
          total: data.total_count
        }
      } catch {
        // Some Gitea/Forgejo versions require owner-level access to list runs
        // rather than plain read — degrade to "no runs shown" instead of erroring.
        return { items: [] }
      }
    },

    async getActionRun(repo, runId, opts) {
      const [run, jobs] = await Promise.all([
        gfFetch<GfActionRunResponse>(
          `/repos/${repo.owner}/${repo.name}/actions/runs/${runId}`,
          undefined,
          opts
        ),
        gfFetch<GfActionRunJobResponse[]>(
          `/repos/${repo.owner}/${repo.name}/actions/runs/${runId}/jobs`,
          undefined,
          opts
        ).catch(() => [])
      ])
      return {
        ...gf.mapActionRun(run),
        jobs: (jobs ?? []).map((j): ForgeActionJob => mapActionJob(j))
      }
    },

    async getActionJobLog(repo, jobId, opts): Promise<ForgeJobLog | null> {
      try {
        const text = await $fetch<string>(
          `${API}/repos/${repo.owner}/${repo.name}/actions/jobs/${jobId}/logs`,
          { headers: headers(opts), responseType: 'text', signal: opts?.signal }
        )
        return parseActionsRunnerLog(text)
      } catch {
        return null
      }
    },

    async searchRepos(q, opts): Promise<Paginated<ForgeRepo>> {
      const page = opts?.cursor ? Number(opts.cursor) : 1
      const limit = opts?.limit ?? 20
      const data = await gfSearchFetch<GfSearchReposResponse>(
        `/repos/search`,
        { q, sort: mapSort(opts?.sort), order: opts?.order, page, limit },
        opts
      )
      const items = (data?.data ?? []).map(gf.mapRepo)
      return { items, cursor: items.length === limit ? String(page + 1) : undefined }
    },

    async searchIssues(q, opts) {
      const page = opts?.cursor ? Number(opts.cursor) : 1
      const limit = opts?.limit ?? 20
      const data = await gfSearchFetch<GfSearchIssueResponse[]>(
        `/repos/issues/search`,
        { q, type: 'issues', state: 'open', page, limit },
        opts
      )
      const items = (data ?? []).map((r: GfSearchIssueResponse) => gf.mapSearchIssue(r, false))
      return { items, cursor: items.length === limit ? String(page + 1) : undefined }
    },

    async searchUsers(q, opts) {
      const page = opts?.cursor ? Number(opts.cursor) : 1
      const limit = opts?.limit ?? 20
      const data = await gfSearchFetch<GfSearchUsersResponse>(
        `/users/search`,
        { q, page, limit },
        opts
      )
      const items = (data?.data ?? [])
        .map(gf.mapUser)
        .filter((u: ForgeUser | undefined): u is ForgeUser => !!u)
      return { items, cursor: items.length === limit ? String(page + 1) : undefined }
    },

    async listNotifications(opts): Promise<ForgeNotification[]> {
      const token = opts?.token ?? getForgeToken(providerId)
      if (!token) return []
      const page = opts?.cursor ? Number(opts.cursor) : 1
      const data = await gfFetch<GfNotificationResponse[]>(
        `/notifications`,
        { all: false, 'status-types': 'unread', page: page, limit: opts?.limit ?? 30 },
        { ...opts, token }
      )
      return (data ?? []).map((n: GfNotificationResponse): ForgeNotification => {
        const repo = gf.repoFromRaw(n.repository)
        const kind = notificationKind(String(n.subject?.type ?? ''))
        const number = notificationNumber(n.subject?.url ?? n.subject?.html_url)
        const to = repo ? gf.notificationRoute(kind, repo.owner, repo.name, number) : null
        return {
          provider: providerId,
          id: String(n.id),
          kind,
          title: n.subject?.title ?? '(notification)',
          reason: n.reason ?? n.subject?.state,
          unread: !!n.unread,
          updatedAt: n.updated_at,
          repo: repo ? { owner: repo.owner, name: repo.name, fullName: repo.fullName } : undefined,
          to,
          url: to ? null : (n.subject?.html_url ?? repo?.url ?? null)
        }
      })
    },

    async listInbox(opts): Promise<ForgeInboxItem[]> {
      const token = opts?.token ?? getForgeToken(providerId)
      if (!token) return []
      const h = headers({ ...opts, token })
      const [raw, me] = await Promise.all([
        $fetch<GfNotificationResponse[]>(`${API}/notifications`, {
          headers: h,
          query: { all: false, 'status-types': 'unread', limit: opts?.limit ?? 50 },
          signal: opts?.signal
        }).catch(() => []),
        $fetch<GfUserResponse | null>(`${API}/user`, { headers: h, signal: opts?.signal }).catch(
          () => null
        )
      ])
      const myLogin = String(me?.login ?? me?.username ?? '').toLowerCase()
      const items = await mapLimit(raw ?? [], 6, async (n): Promise<ForgeInboxItem | null> => {
        const repo = gf.repoFromRaw(n.repository)
        const kind = notificationKind(String(n.subject?.type ?? ''))
        if (kind !== 'pull' && kind !== 'issue') return null
        const number = notificationNumber(n.subject?.url ?? n.subject?.html_url)
        if (!repo || !number) return null
        const item: ForgeInboxItem = {
          provider: providerId,
          id: String(n.id),
          kind,
          title: n.subject?.title ?? '(notification)',
          reason: n.reason ?? n.subject?.state,
          unread: !!n.unread,
          updatedAt: n.updated_at,
          repo: { owner: repo.owner, name: repo.name, fullName: repo.fullName },
          to: gf.notificationRoute(kind, repo.owner, repo.name, number),
          url: n.subject?.html_url ?? repo.url,
          number
        }
        try {
          const path = kind === 'pull' ? 'pulls' : 'issues'
          const subj = await $fetch<GfPullResponse>(
            `${API}/repos/${repo.owner}/${repo.name}/${path}/${number}`,
            { headers: h, signal: opts?.signal }
          )
          const resolved =
            kind === 'pull'
              ? !!(subj.merged_at || subj.merged || subj.state === 'closed')
              : subj.state === 'closed'
          item.state =
            kind === 'pull' ? pullState(subj) : subj.state === 'closed' ? 'closed' : 'open'
          item.resolved = resolved
          item.author = gf.mapUser(subj.user)
          const bk = botKindOf(subj.user?.login ?? subj.user?.username)
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
            const comments = await $fetch<GfCommentResponse[]>(
              `${API}/repos/${repo.owner}/${repo.name}/issues/${number}/comments`,
              {
                headers: h,
                query: { limit: 100 },
                signal: opts?.signal
              }
            ).catch(() => [])
            item.unreadComments = (comments ?? [])
              .filter(
                (c: GfCommentResponse) =>
                  String(c.user?.login ?? c.user?.username ?? '').toLowerCase() !== myLogin
              )
              .slice(-3)
              .map(gf.mapComment)
          }
        } catch {
          return item
        }
        return item
      })
      return items.filter((x): x is ForgeInboxItem => !!x)
    },

    async markNotificationRead(threadId, opts): Promise<void> {
      await $fetch(`${API}/notifications/threads/${threadId}`, {
        method: 'PATCH',
        headers: headers(opts),
        signal: opts?.signal
      }).catch(() => {})
    },

    async createComment(repo, id, body, opts): Promise<ForgeComment> {
      const c = await $fetch<GfCommentResponse>(
        `${API}/repos/${repo.owner}/${repo.name}/issues/${id}/comments`,
        {
          method: 'POST',
          headers: headers(opts),
          body: { body },
          signal: opts?.signal
        }
      )
      return gf.mapComment(c)
    },

    async createReview(repo, id, input, opts): Promise<void> {
      const event = input.event === 'APPROVE' ? 'APPROVED' : input.event
      const body: Record<string, unknown> = { event }
      if (input.body) body.body = input.body
      if (input.comments?.length) {
        body.comments = input.comments.map((c) => ({
          path: c.path,
          body: c.body,
          new_position: c.line
        }))
      }
      await $fetch(`${API}/repos/${repo.owner}/${repo.name}/pulls/${id}/reviews`, {
        method: 'POST',
        headers: headers(opts),
        body,
        signal: opts?.signal
      })
    },

    async addReaction(repo, target, kind, opts): Promise<void> {
      await $fetch(`${API}${gfReactionsPath(repo, target)}`, {
        method: 'POST',
        headers: headers(opts),
        body: { content: GF_REACTION_CONTENT[kind] },
        signal: opts?.signal
      })
    },

    async removeReaction(repo, target, kind, opts): Promise<void> {
      // Gitea deletes the caller's own reaction by content — no reaction id needed.
      await $fetch(`${API}${gfReactionsPath(repo, target)}`, {
        method: 'DELETE',
        headers: headers(opts),
        body: { content: GF_REACTION_CONTENT[kind] },
        signal: opts?.signal
      })
    },

    async mergePull(repo, id, opts): Promise<ForgeMergeResult> {
      const methods = opts?.method ? [opts.method] : (['squash', 'merge', 'rebase'] as const)
      let lastErr: unknown
      for (const method of methods) {
        try {
          await $fetch(`${API}/repos/${repo.owner}/${repo.name}/pulls/${id}/merge`, {
            method: 'POST',
            headers: headers(opts),
            body: { Do: method },
            signal: opts?.signal
          })
          return { merged: true }
        } catch (e) {
          lastErr = e
          if (errStatus(e) !== 405) break
        }
      }
      throw lastErr
    },

    async isStarred(repo, opts): Promise<boolean> {
      const token = opts?.token ?? getForgeToken(providerId)
      if (!token) return false
      try {
        await $fetch(`${API}/user/starred/${repo.owner}/${repo.name}`, {
          headers: headers({ ...opts, token }),
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
        headers: headers(opts),
        signal: opts?.signal
      })
      return { starred }
    },

    async listFollowedRepos(opts): Promise<ForgeRepo[]> {
      const token = opts?.token ?? getForgeToken(providerId)
      if (!token) return []
      const following = await gfFetch<GfUserResponse[]>(
        `/user/following`,
        { limit: 100 },
        { ...opts, token }
      ).catch(() => [])
      const perOwner = await mapLimit((following ?? []).slice(0, 20), 6, async (u) => {
        const login = u.login ?? u.username ?? ''
        if (!login) return [] as ForgeRepo[]
        const data = await gfFetch<GfRepoResponse[]>(
          `/users/${login}/repos`,
          { limit: 5, page: 1, sort: 'updated' },
          { ...opts, token }
        ).catch(() => [])
        return (data ?? []).map(gf.mapRepo)
      })
      const seen = new Set<string>()
      return perOwner
        .flat()
        .filter((r) => !r.isFork && !r.isPrivate)
        .filter((r) => {
          if (seen.has(r.fullName)) return false
          seen.add(r.fullName)
          return true
        })
        .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))
    },

    async listFollowing(opts): Promise<ForgeUser[]> {
      const token = opts?.token ?? getForgeToken(providerId)
      if (!token) return []
      const data = await gfFetch<GfUserResponse[]>(
        `/user/following`,
        { limit: opts?.limit ?? 100 },
        { ...opts, token }
      ).catch(() => [])
      return (data ?? []).map(gf.mapUser).filter((u): u is ForgeUser => !!u)
    },

    async listUserFollowing(login, opts): Promise<ForgeUser[]> {
      const data = await cachedFetch<GfUserResponse[]>(
        `${API}/users/${encodeURIComponent(login)}/following`,
        { limit: opts?.limit ?? 100 },
        {
          token: opts?.token ?? getForgeToken(providerId),
          headers: headers(opts),
          proxyPath: '/api/graph-proxy',
          signal: opts?.signal
        }
      ).catch(() => [])
      return (data ?? []).map(gf.mapUser).filter((u): u is ForgeUser => !!u)
    },

    async listUserFollowers(login, opts): Promise<ForgeUser[]> {
      const data = await cachedFetch<GfUserResponse[]>(
        `${API}/users/${encodeURIComponent(login)}/followers`,
        { limit: opts?.limit ?? 100 },
        {
          token: opts?.token ?? getForgeToken(providerId),
          headers: headers(opts),
          proxyPath: '/api/graph-proxy',
          signal: opts?.signal
        }
      ).catch(() => [])
      return (data ?? []).map(gf.mapUser).filter((u): u is ForgeUser => !!u)
    },

    async listContributors(repo, opts): Promise<ForgeUser[]> {
      return deriveContributorsFromCommits(
        providerId,
        () => provider.getRepo!(repo.owner, repo.name, opts).then((r) => r.defaultBranch),
        (ref) => provider.listCommits!(repo, ref, { ...opts, limit: 100 }),
        opts?.limit ?? 8
      )
    },

    async listUserEvents(login, opts): Promise<ForgeContribution[]> {
      const limit = Math.min(opts?.limit ?? 100, 100)
      const page = opts?.cursor ? Number(opts.cursor) : 1
      const data = await gfFetch<GfActivityResponse[]>(
        `/users/${encodeURIComponent(login)}/activities/feeds`,
        { 'only-performed-by': true, page, limit },
        opts
      ).catch(() => [])
      return (data ?? []).map(gf.mapEvent).filter((c): c is ForgeContribution => !!c)
    },

    async listMyWork(opts): Promise<ForgeMyWork> {
      const token = opts?.token ?? getForgeToken(providerId)
      if (!token) return { authoredPulls: [], reviewRequests: [], assignedIssues: [] }
      const run = (query: Record<string, unknown>, isPull: boolean) =>
        gfFetch<GfSearchIssueResponse[]>(`/repos/issues/search`, query, { ...opts, token })
          .then((items) =>
            (items ?? []).map((r: GfSearchIssueResponse) => gf.mapSearchIssue(r, isPull))
          )
          .catch(() => [])
      const [authoredPulls, reviewRequests, assignedIssues] = await Promise.all([
        run({ type: 'pulls', state: 'open', created: true, limit: 50 }, true),
        run({ type: 'pulls', state: 'open', review_requested: true, limit: 50 }, true),
        run({ type: 'issues', state: 'open', assigned: true, limit: 50 }, false)
      ])
      return { authoredPulls, reviewRequests, assignedIssues }
    }
  }

  return provider
}
