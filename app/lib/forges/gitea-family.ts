import type {
  ForgeActionJob,
  ForgeActionRun,
  ForgeActionStep,
  ForgeBranch,
  ForgeBlob,
  ForgeCommit,
  ForgeCommitActor,
  ForgeCommitDetail,
  ForgeComment,
  ForgeContribution,
  ForgeEventKind,
  ForgeFileDiff,
  ForgeId,
  ForgeInboxItem,
  ForgeIssue,
  ForgeIssueDetail,
  ForgeJobLog,
  ForgeMergeResult,
  ForgeMyWork,
  ForgeNotification,
  ForgePull,
  ForgePullDetail,
  ForgePullState,
  ForgeProvider,
  ForgeReactionKind,
  ForgeReactionSummary,
  ForgeReactionTarget,
  ForgeReadOptions,
  ForgeRepo,
  ForgeRunStatus,
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

/** Config for one Gitea-flavored instance (Gitea itself, or a fork like Forgejo). */
export interface GiteaFamilyConfig {
  id: ForgeId
  label: string
  icon: string
  color?: string
  /** e.g. "https://codeberg.org/api/v1" */
  apiBase: string
  /** e.g. "https://codeberg.org" */
  webBase: string
  ownerLabel?: string
  ownerPlaceholder: string
  repoPlaceholder: string
}

// Raw Gitea-family (Gitea/Forgejo) REST API response shapes. These model only
// the fields this file actually reads; Gitea is inconsistent about optionality
// (e.g. `login` vs `username`), so most fields are optional.

interface GfUserResponse {
  login?: string
  username?: string
  full_name?: string | null
  fullname?: string | null
  avatar_url?: string | null
  html_url?: string | null
}

/** The nested git-level author/committer identity on a commit (name/email/date, no account info). */
interface GfGitActor {
  name?: string
  email?: string
  date?: string
  timestamp?: string
}

/**
 * `mapCommitActor`'s first argument is sometimes the git-level actor
 * (`commit.author`, with name/email/date) and sometimes falls back to the
 * top-level account object (`author`, with login/avatar_url) depending on
 * which endpoint produced the commit. Merge both shapes so either can be
 * passed without a weak-type mismatch.
 */
interface GfCommitActorRaw {
  name?: string
  email?: string
  date?: string
  timestamp?: string
  login?: string
  username?: string
  avatar_url?: string | null
  full_name?: string | null
  fullname?: string | null
  html_url?: string | null
}

interface GfRepoResponse {
  owner?: GfUserResponse | null
  name?: string
  full_name?: string
  description?: string | null
  default_branch?: string
  html_url?: string
  website?: string | null
  language?: string | null
  topics?: string[]
  stars_count?: number
  forks_count?: number
  watchers_count?: number
  open_issues_count?: number
  private?: boolean
  fork?: boolean
  created_at?: string | null
  updated_at?: string | null
}

interface GfTopicsResponse {
  topics?: string[]
}

/** Minimal repo reference embedded in events/notifications/search results. */
interface GfRepoRefResponse {
  owner?: GfUserResponse | null
  name?: string
  full_name?: string
  html_url?: string
}

/** A repo reference that may be embedded directly or nested under `repository`/`repo`. */
interface GfRepoRefContainer extends GfRepoRefResponse {
  repository?: GfRepoRefResponse
  repo?: GfRepoRefResponse
}

interface GfLabelResponse {
  name: string
  color?: string | null
  description?: string | null
}

interface GfIssueResponse {
  number?: number
  index?: number
  title?: string
  state?: string
  user?: GfUserResponse | null
  body?: string | null
  comments?: number
  labels?: (GfLabelResponse | string)[]
  created_at?: string | null
  updated_at?: string | null
  closed_at?: string | null
  html_url?: string
  pull_request?: unknown
}

interface GfPullResponse extends GfIssueResponse {
  merged_at?: string | null
  merged?: boolean
  draft?: boolean
  head?: { ref?: string }
  base?: { ref?: string }
  additions?: number
  deletions?: number
  changed_files?: number
  commits?: number
}

/** Issue/pull search results embed the owning repo. */
interface GfSearchIssueResponse extends GfIssueResponse {
  repository?: GfRepoRefResponse
  repo?: GfRepoRefResponse
}

interface GfCommentResponse {
  id?: number | string
  user?: GfUserResponse | null
  body?: string | null
  created_at?: string | null
  html_url?: string | null
}

interface GfReactionResponse {
  content: string
  user?: GfUserResponse | null
}

interface GfCommitResponse {
  sha?: string
  id?: string
  commit?: {
    message?: string
    author?: GfGitActor
    committer?: GfGitActor
  }
  message?: string
  author?: GfUserResponse | null
  committer?: GfUserResponse | null
  html_url?: string | null
  parents?: { sha?: string; id?: string }[]
}

/** The `/git/commits/{sha}` endpoint returns a commit plus diff stat/files. */
interface GfGitCommitResponse extends GfCommitResponse {
  stats?: { additions?: number; deletions?: number; total?: number }
  files?: GfFileDiffResponse[]
}

interface GfFileDiffResponse {
  previous_filename?: string
  filename?: string
  path?: string
  status?: string
  additions?: number
  deletions?: number
  changes?: number
  patch?: string | null
}

/** Contents API entry: a tree listing item, or a single file/blob when requesting a path directly. */
interface GfContentResponse {
  name?: string
  path?: string
  type?: string
  size?: number
  sha?: string
  content?: string
}

interface GfBranchResponse {
  name: string
  commit?: { id?: string; message?: string; timestamp?: string }
}

/** A single entry from the user activity feed (`/users/{login}/activities/feeds`). */
interface GfActivityResponse {
  id?: number | string
  op_type?: string
  act_user?: GfUserResponse | null
  repo?: GfRepoRefResponse
  content?: string | null
  ref_name?: string | null
  created?: string
  created_at?: string
}

interface GfNotificationResponse {
  id: number | string
  subject?: {
    type?: string
    title?: string
    url?: string
    html_url?: string
    state?: string
  }
  repository?: GfRepoRefResponse
  reason?: string | null
  unread?: boolean
  updated_at?: string
}

interface GfSearchReposResponse {
  ok?: boolean
  data?: GfRepoResponse[]
}

interface GfSearchUsersResponse {
  ok?: boolean
  data?: GfUserResponse[]
}

/** `GET /repos/{owner}/{repo}/actions/runs` — Gitea/Forgejo Actions run list. */
interface GfActionRunResponse {
  id?: number
  title?: string
  workflow_id?: string
  index?: number
  trigger_user?: GfUserResponse | null
  pretty_ref?: string
  commit_sha?: string
  event?: string
  status?: string
  started?: string | null
  stopped?: string | null
  created?: string | null
  updated?: string | null
  html_url?: string
}

interface GfActionRunListResponse {
  entries?: GfActionRunResponse[]
  total_count?: number
}

interface GfActionRunJobStepResponse {
  number?: number
  name?: string
  status?: string
  started?: string | null
  stopped?: string | null
}

interface GfActionRunJobResponse {
  id?: number
  name?: string
  status?: string
  steps?: GfActionRunJobStepResponse[]
}

function botKindOf(login?: string | null): 'dependabot' | 'renovate' | null {
  const l = String(login ?? '').toLowerCase()
  if (!l) {
    return null
  }
  if (l.includes('dependabot')) {
    return 'dependabot'
  }
  if (l.includes('renovate')) {
    return 'renovate'
  }
  return null
}

function errStatus(e: unknown): number | undefined {
  if (!e || typeof e !== 'object') {
    return undefined
  }
  const err = e as { statusCode?: number; status?: number; response?: { status?: number } }
  return err.statusCode ?? err.status ?? err.response?.status
}

function loginOf(u: GfUserResponse | null | undefined): string {
  return String(u?.login ?? u?.username ?? '')
}

/** Gitea's default reaction content set mirrors GitHub's — same strings, no per-instance mapping needed. */
const GF_REACTION_CONTENT: Record<ForgeReactionKind, string> = {
  thumbsup: '+1',
  thumbsdown: '-1',
  laugh: 'laugh',
  hooray: 'hooray',
  confused: 'confused',
  heart: 'heart',
  rocket: 'rocket',
  eyes: 'eyes'
}

const GF_REACTION_FROM_CONTENT: Record<string, ForgeReactionKind> = Object.fromEntries(
  (Object.entries(GF_REACTION_CONTENT) as [ForgeReactionKind, string][]).map(([kind, content]) => [
    content,
    kind
  ])
)

function mapGfReactions(
  list: GfReactionResponse[],
  myLogin: string | null
): ForgeReactionSummary[] | undefined {
  const byKind = new Map<ForgeReactionKind, { count: number; mine: boolean }>()
  for (const r of list) {
    const kind = GF_REACTION_FROM_CONTENT[r.content]
    if (!kind) continue
    const entry = byKind.get(kind) ?? { count: 0, mine: false }
    entry.count++
    if (myLogin && loginOf(r.user).toLowerCase() === myLogin.toLowerCase()) entry.mine = true
    byKind.set(kind, entry)
  }
  if (!byKind.size) return undefined
  return Array.from(byKind.entries()).map(([kind, v]) => ({
    kind,
    count: v.count,
    viewerReacted: v.mine
  }))
}

function decodeBase64Utf8(b64: string): string {
  const binary = atob(b64.replace(/\s/g, ''))
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function looksBinary(b64: string): boolean {
  try {
    const sample = atob(b64.replace(/\s/g, '').slice(0, 512))
    for (let i = 0; i < sample.length; i++) {
      if (sample.charCodeAt(i) === 0) {
        return true
      }
    }
    return false
  } catch {
    return false
  }
}

function sortEntries(a: ForgeTreeEntry, b: ForgeTreeEntry): number {
  if (a.type !== b.type) {
    return a.type === 'dir' ? -1 : 1
  }
  return a.name.localeCompare(b.name)
}

function encodePath(path: string): string {
  return path.split('/').filter(Boolean).map(encodeURIComponent).join('/')
}

function giteaRunStatus(s?: string): ForgeRunStatus {
  switch (s) {
    case 'success':
      return 'success'
    case 'failure':
      return 'failure'
    case 'cancelled':
      return 'cancelled'
    case 'skipped':
      return 'skipped'
    case 'running':
      return 'running'
    case 'waiting':
    case 'blocked':
      return 'pending'
    default:
      return 'unknown'
  }
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

/** Build a `ForgeProvider` for any Gitea-flavored REST API (Gitea, Forgejo, ...). */
export function createGiteaFamilyProvider(config: GiteaFamilyConfig): ForgeProvider {
  const { id: providerId, apiBase: API, webBase: WEB } = config

  function headers(opts?: ForgeReadOptions): Record<string, string> {
    const h: Record<string, string> = { Accept: 'application/json' }
    const token = opts?.token ?? getForgeToken(providerId)
    if (token) {
      h.Authorization = 'Bearer ' + token
    }
    return h
  }

  function contentUrl(owner: string, repo: string, path: string): string {
    const enc = encodePath(path)
    return enc
      ? `${API}/repos/${owner}/${repo}/contents/${enc}`
      : `${API}/repos/${owner}/${repo}/contents`
  }

  function mapUser(u: GfUserResponse | null | undefined): ForgeUser | undefined {
    if (!u) {
      return undefined
    }
    const login = loginOf(u)
    return {
      provider: providerId,
      login,
      displayName: u.full_name ?? u.fullname ?? null,
      avatarUrl: u.avatar_url ?? null,
      url: u.html_url ?? (login ? `${WEB}/${login}` : null)
    }
  }

  function mapCommitActor(
    gitActor: GfCommitActorRaw | null | undefined,
    user: GfUserResponse | null | undefined
  ): ForgeCommitActor | undefined {
    if (!gitActor && !user) {
      return undefined
    }
    return {
      name: gitActor?.name,
      email: gitActor?.email,
      when: gitActor?.date ?? gitActor?.timestamp,
      login: loginOf(user) || undefined,
      avatarUrl: user?.avatar_url ?? null
    }
  }

  function mapRepo(r: GfRepoResponse): ForgeRepo {
    const owner = loginOf(r.owner)
    return {
      provider: providerId,
      owner,
      name: r.name ?? '',
      fullName: r.full_name ?? (owner && r.name ? `${owner}/${r.name}` : ''),
      description: r.description ?? null,
      defaultBranch: r.default_branch || 'main',
      url: r.html_url ?? (owner && r.name ? `${WEB}/${owner}/${r.name}` : WEB),
      ownerUrl: r.owner?.html_url ?? (owner ? `${WEB}/${owner}` : undefined),
      ownerAvatar: r.owner?.avatar_url ?? null,
      homepage: r.website || null,
      language: r.language ?? null,
      topics: r.topics ?? [],
      stars: r.stars_count,
      forks: r.forks_count,
      watchers: r.watchers_count,
      issues: r.open_issues_count,
      isPrivate: r.private,
      isFork: r.fork,
      license: null,
      createdAt: r.created_at ?? null,
      updatedAt: r.updated_at ?? null
    }
  }

  function mapLabel(l: GfLabelResponse | string): {
    name: string
    color?: string | null
    description?: string | null
  } {
    if (typeof l === 'string') {
      return { name: l }
    }
    return { name: l.name, color: l.color, description: l.description }
  }

  function mapIssue(r: GfIssueResponse): ForgeIssue {
    return {
      provider: providerId,
      id: String(r.number ?? r.index ?? ''),
      number: r.number ?? r.index,
      title: r.title ?? '',
      state: r.state === 'closed' ? 'closed' : 'open',
      author: mapUser(r.user),
      body: r.body ?? null,
      commentCount: r.comments,
      labels: (r.labels ?? []).map(mapLabel),
      createdAt: r.created_at ?? null,
      updatedAt: r.updated_at ?? null,
      closedAt: r.closed_at ?? null,
      url: r.html_url,
      isPull: !!r.pull_request
    }
  }

  function pullState(r: GfPullResponse): ForgePullState {
    if (r.merged_at || r.merged) {
      return 'merged'
    }
    if (r.state === 'closed') {
      return 'closed'
    }
    if (r.draft) {
      return 'draft'
    }
    return 'open'
  }

  function mapPull(r: GfPullResponse): ForgePull {
    return {
      provider: providerId,
      id: String(r.number ?? r.index ?? ''),
      number: r.number ?? r.index,
      title: r.title ?? '',
      state: pullState(r),
      author: mapUser(r.user),
      body: r.body ?? null,
      commentCount: r.comments,
      labels: (r.labels ?? []).map(mapLabel),
      sourceBranch: r.head?.ref,
      targetBranch: r.base?.ref,
      createdAt: r.created_at ?? null,
      updatedAt: r.updated_at ?? null,
      mergedAt: r.merged_at ?? null,
      closedAt: r.closed_at ?? null,
      url: r.html_url
    }
  }

  function mapComment(r: GfCommentResponse): ForgeComment {
    return {
      id: String(r.id),
      author: mapUser(r.user),
      body: r.body ?? '',
      createdAt: r.created_at ?? null,
      url: r.html_url
    }
  }

  function mapCommit(r: GfCommitResponse): ForgeCommit {
    const sha = String(r.sha ?? r.id ?? '')
    return {
      sha,
      shortSha: sha ? sha.slice(0, 7) : '',
      message: r.commit?.message ?? r.message ?? '',
      author: mapCommitActor(r.commit?.author ?? r.author, r.author),
      committer: mapCommitActor(r.commit?.committer ?? r.committer, r.committer),
      url: r.html_url,
      parents: (r.parents ?? []).map((p) => p.sha ?? p.id).filter(Boolean) as string[]
    }
  }

  function fileStatus(status?: string): ForgeFileDiff['status'] {
    switch (status) {
      case 'added':
        return 'added'
      case 'deleted':
      case 'removed':
        return 'removed'
      case 'renamed':
        return 'renamed'
      case 'copied':
        return 'copied'
      case 'changed':
        return 'changed'
      default:
        return 'modified'
    }
  }

  function mapFileDiff(f: GfFileDiffResponse, patch?: string | null): ForgeFileDiff {
    const p = patch ?? f.patch ?? null
    return {
      oldPath: f.previous_filename,
      path: f.filename ?? f.path ?? '',
      status: fileStatus(f.status),
      additions: f.additions,
      deletions: f.deletions,
      isBinary: p == null && f.changes === 0,
      patch: p
    }
  }

  function splitUnifiedDiff(text: string): Record<string, string> {
    const out: Record<string, string> = {}
    const parts = String(text ?? '')
      .split(/(?=^diff --git )/m)
      .filter(Boolean)
    for (const part of parts) {
      const plus = part.match(/^\+\+\+ b\/(.+)$/m)
      const diff = part.match(/^diff --git a\/(.+?) b\/(.+)$/m)
      const path = plus?.[1] && plus[1] !== '/dev/null' ? plus[1] : (diff?.[2] ?? '')
      if (path) {
        out[path] = part
      }
    }
    return out
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
    if (!readme) {
      return null
    }
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

  function topLanguage(languages: Record<string, number> | null | undefined): string | null {
    const entries = Object.entries(languages ?? {})
    entries.sort((a, b) => b[1] - a[1])
    return entries[0]?.[0] ?? null
  }

  function mapSort(sort?: ForgeSearchOptions['sort']): string | undefined {
    switch (sort) {
      case 'stars':
        return 'stars'
      case 'updated':
        return 'updated'
      case 'created':
        return 'created'
      case 'forks':
        return 'forks'
      default:
        return undefined
    }
  }

  function repoFromRaw(
    r: GfRepoRefContainer | undefined
  ):
    | { provider: ForgeId; owner: string; name: string; fullName: string; url?: string }
    | undefined {
    const raw = r?.repository ?? r?.repo ?? r
    const fullName = String(raw?.full_name ?? '')
    let owner = loginOf(raw?.owner)
    let name = String(raw?.name ?? '')
    if ((!owner || !name) && fullName) {
      const idx = fullName.lastIndexOf('/')
      owner = idx >= 0 ? fullName.slice(0, idx) : owner
      name = idx >= 0 ? fullName.slice(idx + 1) : name
    }
    if (!owner || !name) {
      return undefined
    }
    return {
      provider: providerId,
      owner,
      name,
      fullName: fullName || `${owner}/${name}`,
      url: raw?.html_url ?? `${WEB}/${owner}/${name}`
    }
  }

  function mapSearchIssue(r: GfSearchIssueResponse, isPull?: boolean): ForgeIssue {
    const issue = mapIssue(r)
    issue.isPull = isPull ?? issue.isPull
    const repo = repoFromRaw(r)
    if (repo) {
      issue.repo = repo
    }
    return issue
  }

  function notificationKind(type: string): ForgeNotification['kind'] {
    switch (type.toLowerCase()) {
      case 'issue':
        return 'issue'
      case 'pull':
      case 'pullrequest':
        return 'pull'
      case 'commit':
        return 'commit'
      case 'repository':
        return 'other'
      default:
        return 'other'
    }
  }

  function notificationNumber(url?: string): number | undefined {
    const m = String(url ?? '').match(/\/(?:issues|pulls)\/(\d+)(?:$|[/?#])/)
    if (!m?.[1]) {
      return undefined
    }
    return Number(m[1])
  }

  function notificationRoute(
    kind: ForgeNotification['kind'],
    owner: string,
    name: string,
    number?: number
  ): string | null {
    if (!owner || !name) {
      return null
    }
    if ((kind === 'issue' || kind === 'pull') && number) {
      return issuePath({
        provider: providerId,
        id: String(number),
        isPull: kind === 'pull',
        repo: { owner, name }
      })
    }
    return null
  }

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

  function eventKind(op: string): ForgeEventKind {
    switch (op) {
      case 'commit_repo':
        return 'push'
      case 'create_pull_request':
        return 'pr_opened'
      case 'merge_pull_request':
        return 'pr_merged'
      case 'comment_issue':
      case 'comment_pull':
        return 'comment'
      case 'create_issue':
        return 'issue_opened'
      case 'close_issue':
        return 'issue_closed'
      case 'create_repo':
      case 'push_tag':
      case 'create_tag':
      case 'create_branch':
        return 'create'
      case 'star_repo':
        return 'star'
      case 'create_release':
        return 'release'
      default:
        return 'other'
    }
  }

  function mapEvent(e: GfActivityResponse): ForgeContribution | null {
    const actor = mapUser(e.act_user)
    const repo = repoFromRaw(e.repo)
    if (!actor || !repo) {
      return null
    }
    const kind = eventKind(String(e.op_type ?? ''))
    const title = e.content ?? e.ref_name ?? repo.fullName
    const baseUrl = repo.url ?? `${WEB}/${repo.fullName}`
    const url = e.ref_name
      ? `${baseUrl}/src/branch/${encodeURIComponent(String(e.ref_name))}`
      : baseUrl
    return {
      provider: providerId,
      id: String(e.id ?? `${e.op_type}-${e.created}`),
      kind,
      actor,
      repo,
      title,
      url,
      createdAt: String(e.created ?? e.created_at ?? ''),
      refType: e.ref_name ? 'ref' : undefined,
      impact: EVENT_IMPACT[kind]
    }
  }

  function mapActionRun(r: GfActionRunResponse): ForgeActionRun {
    return {
      provider: providerId,
      id: String(r.id ?? ''),
      name: r.title || (r.workflow_id ? `${r.workflow_id} #${r.index ?? ''}` : `Run ${r.id ?? ''}`),
      status: giteaRunStatus(r.status),
      event: r.event ?? null,
      branch: r.pretty_ref ?? null,
      commitSha: r.commit_sha ?? null,
      actor: mapUser(r.trigger_user),
      createdAt: r.created ?? null,
      updatedAt: r.updated ?? null,
      url: r.html_url
    }
  }

  function mapActionJob(j: GfActionRunJobResponse): ForgeActionJob {
    return {
      id: String(j.id ?? ''),
      name: j.name ?? '',
      status: giteaRunStatus(j.status),
      steps: (j.steps ?? []).map(
        (s): ForgeActionStep => ({
          name: s.name ?? '',
          status: giteaRunStatus(s.status),
          number: s.number,
          startedAt: s.started ?? null,
          completedAt: s.stopped ?? null
        })
      )
    }
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
    const login = loginOf(me)
    if (login) reactionLoginCache.set(token, login)
    return login || null
  }

  function gfReactionsPath(repo: RepoLocator, target: ForgeReactionTarget): string {
    const base = `/repos/${repo.owner}/${repo.name}`
    return target.commentId
      ? `${base}/issues/comments/${target.commentId}/reactions`
      : `${base}/issues/${target.threadId}/reactions`
  }

  const provider: ForgeProvider = {
    id: providerId,
    label: config.label,
    icon: config.icon,
    color: config.color,
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
      const mapped = mapRepo(raw)
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
      return (data ?? []).map(mapRepo)
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
      const items = (data ?? []).map(mapIssue)
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
        ...mapIssue(issue),
        comments: (comments ?? []).map(mapComment),
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
      let items = (data ?? []).map(mapPull)
      if (opts?.state === 'merged') {
        items = items.filter((p) => p.state === 'merged')
      }
      if (opts?.state === 'draft') {
        items = items.filter((p) => p.state === 'draft')
      }
      if (opts?.state === 'closed') {
        items = items.filter((p) => p.state === 'closed')
      }
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
        ...mapPull(pr),
        stat: { additions: pr.additions, deletions: pr.deletions, filesChanged: pr.changed_files },
        commitCount: pr.commits ?? commits.length,
        comments: (comments ?? []).map(mapComment),
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
        const items = (data.entries ?? []).map(mapActionRun)
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
      return { ...mapActionRun(run), jobs: (jobs ?? []).map(mapActionJob) }
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
      const items = (data?.data ?? []).map(mapRepo)
      return { items, cursor: items.length === limit ? String(page + 1) : undefined }
    },

    async searchIssues(q, opts): Promise<Paginated<ForgeIssue>> {
      const page = opts?.cursor ? Number(opts.cursor) : 1
      const limit = opts?.limit ?? 20
      const data = await gfSearchFetch<GfSearchIssueResponse[]>(
        `/repos/issues/search`,
        { q, type: 'issues', state: 'open', page, limit },
        opts
      )
      const items = (data ?? []).map((r: GfSearchIssueResponse) => mapSearchIssue(r, false))
      return { items, cursor: items.length === limit ? String(page + 1) : undefined }
    },

    async searchUsers(q, opts): Promise<Paginated<ForgeUser>> {
      const page = opts?.cursor ? Number(opts.cursor) : 1
      const limit = opts?.limit ?? 20
      const data = await gfSearchFetch<GfSearchUsersResponse>(
        `/users/search`,
        { q, page, limit },
        opts
      )
      const items = (data?.data ?? [])
        .map(mapUser)
        .filter((u: ForgeUser | undefined): u is ForgeUser => !!u)
      return { items, cursor: items.length === limit ? String(page + 1) : undefined }
    },

    async listNotifications(opts): Promise<ForgeNotification[]> {
      const token = opts?.token ?? getForgeToken(providerId)
      if (!token) {
        return []
      }
      const page = opts?.cursor ? Number(opts.cursor) : 1
      const data = await gfFetch<GfNotificationResponse[]>(
        `/notifications`,
        { all: false, 'status-types': 'unread', page: page, limit: opts?.limit ?? 30 },
        { ...opts, token }
      )
      return (data ?? []).map((n: GfNotificationResponse): ForgeNotification => {
        const repo = repoFromRaw(n.repository)
        const kind = notificationKind(String(n.subject?.type ?? ''))
        const number = notificationNumber(n.subject?.url ?? n.subject?.html_url)
        const to = repo ? notificationRoute(kind, repo.owner, repo.name, number) : null
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
      if (!token) {
        return []
      }
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
      const myLogin = loginOf(me).toLowerCase()
      const items = await mapLimit(raw ?? [], 6, async (n): Promise<ForgeInboxItem | null> => {
        const repo = repoFromRaw(n.repository)
        const kind = notificationKind(String(n.subject?.type ?? ''))
        if (kind !== 'pull' && kind !== 'issue') {
          return null
        }
        const number = notificationNumber(n.subject?.url ?? n.subject?.html_url)
        if (!repo || !number) {
          return null
        }
        const item: ForgeInboxItem = {
          provider: providerId,
          id: String(n.id),
          kind,
          title: n.subject?.title ?? '(notification)',
          reason: n.reason ?? n.subject?.state,
          unread: !!n.unread,
          updatedAt: n.updated_at,
          repo: { owner: repo.owner, name: repo.name, fullName: repo.fullName },
          to: notificationRoute(kind, repo.owner, repo.name, number),
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
          item.author = mapUser(subj.user)
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
              .filter((c: GfCommentResponse) => loginOf(c.user).toLowerCase() !== myLogin)
              .slice(-3)
              .map(mapComment)
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
      return mapComment(c)
    },

    async createReview(repo, id, input, opts): Promise<void> {
      const event = input.event === 'APPROVE' ? 'APPROVED' : input.event
      const body: Record<string, unknown> = { event }
      if (input.body) {
        body.body = input.body
      }
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
          if (errStatus(e) !== 405) {
            break
          }
        }
      }
      throw lastErr
    },

    async isStarred(repo, opts): Promise<boolean> {
      const token = opts?.token ?? getForgeToken(providerId)
      if (!token) {
        return false
      }
      try {
        await $fetch(`${API}/user/starred/${repo.owner}/${repo.name}`, {
          headers: headers({ ...opts, token }),
          signal: opts?.signal
        })
        return true
      } catch (e) {
        if (errStatus(e) === 404) {
          return false
        }
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
      if (!token) {
        return []
      }
      const following = await gfFetch<GfUserResponse[]>(
        `/user/following`,
        { limit: 100 },
        { ...opts, token }
      ).catch(() => [])
      const perOwner = await mapLimit((following ?? []).slice(0, 20), 6, async (u) => {
        const login = loginOf(u)
        if (!login) {
          return [] as ForgeRepo[]
        }
        const data = await gfFetch<GfRepoResponse[]>(
          `/users/${login}/repos`,
          { limit: 5, page: 1, sort: 'updated' },
          { ...opts, token }
        ).catch(() => [])
        return (data ?? []).map(mapRepo)
      })
      const seen = new Set<string>()
      return perOwner
        .flat()
        .filter((r) => !r.isFork && !r.isPrivate)
        .filter((r) => {
          if (seen.has(r.fullName)) {
            return false
          }
          seen.add(r.fullName)
          return true
        })
        .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))
    },

    async listFollowing(opts): Promise<ForgeUser[]> {
      const token = opts?.token ?? getForgeToken(providerId)
      if (!token) {
        return []
      }
      const data = await gfFetch<GfUserResponse[]>(
        `/user/following`,
        { limit: opts?.limit ?? 100 },
        { ...opts, token }
      ).catch(() => [])
      return (data ?? []).map(mapUser).filter((u): u is ForgeUser => !!u)
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
      return (data ?? []).map(mapUser).filter((u): u is ForgeUser => !!u)
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
      return (data ?? []).map(mapUser).filter((u): u is ForgeUser => !!u)
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
      return (data ?? []).map(mapEvent).filter((c): c is ForgeContribution => !!c)
    },

    async listMyWork(opts): Promise<ForgeMyWork> {
      const token = opts?.token ?? getForgeToken(providerId)
      if (!token) {
        return { authoredPulls: [], reviewRequests: [], assignedIssues: [] }
      }
      const run = (query: Record<string, unknown>, isPull: boolean): Promise<ForgeIssue[]> =>
        gfFetch<GfSearchIssueResponse[]>(`/repos/issues/search`, query, { ...opts, token })
          .then((items) =>
            (items ?? []).map((r: GfSearchIssueResponse) => mapSearchIssue(r, isPull))
          )
          .catch(() => [] as ForgeIssue[])
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
