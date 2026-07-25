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
  ForgeEventKind,
  ForgeFileDiff,
  ForgeId,
  ForgeInboxItem,
  ForgeIssue,
  ForgeIssueDetail,
  ForgeMergeQueueEntry,
  ForgeMergeQueueStats,
  ForgeMergeResult,
  ForgeMyWork,
  ForgeNotification,
  ForgePull,
  ForgePullDetail,
  ForgePullState,
  ForgeProvider,
  ForgeReadOptions,
  ForgeRepo,
  ForgeRunStatus,
  ForgeSearchCode,
  ForgeTreeEntry,
  ForgeUser,
  Paginated,
  RepoLocator
} from '~/types/forge'

import { getForgeToken } from '~/lib/forges/token-store'

// Raw GitLab REST API v4 response shapes — only the fields this file actually
// reads. These are intentionally loose (most fields optional) since GitLab's
// real payloads carry many more fields than we use.

interface GlUserResponse {
  id?: number
  username?: string
  name?: string | null
  avatar_url?: string | null
  web_url?: string | null
}

interface GlNamespaceResponse {
  full_path?: string
  web_url?: string
  avatar_url?: string | null
}

interface GlLicenseResponse {
  nickname?: string | null
  name?: string | null
}

interface GlProjectResponse {
  id: number
  path: string
  path_with_namespace?: string
  description?: string | null
  default_branch?: string | null
  web_url: string
  namespace?: GlNamespaceResponse | null
  avatar_url?: string | null
  topics?: string[]
  tag_list?: string[]
  star_count?: number
  forks_count?: number
  open_issues_count?: number
  visibility?: string
  forked_from_project?: unknown
  license?: GlLicenseResponse | null
  created_at?: string | null
  last_activity_at?: string | null
  updated_at?: string | null
}

/** Fields shared by merge-request-shaped payloads (MRs and MR-ish todo targets). */
interface GlMrStateFields {
  state?: string
  merged_at?: string | null
  draft?: boolean
  work_in_progress?: boolean
}

interface GlReferencesResponse {
  full?: string
}

interface GlLabelResponse {
  name: string
  color?: string | null
  description?: string | null
}

interface GlIssueResponse {
  iid: number
  title: string
  state?: string
  author?: GlUserResponse
  description?: string | null
  web_url?: string
  user_notes_count?: number
  labels?: (string | GlLabelResponse)[]
  created_at?: string | null
  updated_at?: string | null
  closed_at?: string | null
  references?: GlReferencesResponse
}

interface GlMergeRequestResponse extends GlMrStateFields {
  iid: number
  title: string
  author?: GlUserResponse
  description?: string | null
  web_url?: string
  user_notes_count?: number
  labels?: (string | GlLabelResponse)[]
  source_branch?: string
  target_branch?: string
  created_at?: string | null
  updated_at?: string | null
  closed_at?: string | null
  changes_count?: string | number | null
  merge_error?: string | null
  references?: GlReferencesResponse
}

interface GlNoteResponse {
  id: number
  author?: GlUserResponse
  body?: string
  created_at?: string | null
  system?: boolean
}

interface GlCommitResponse {
  id: string
  short_id?: string
  message?: string
  title?: string
  author_name?: string
  author_email?: string
  authored_date?: string
  committer_name?: string
  committer_email?: string
  committed_date?: string
  created_at?: string
  web_url?: string
  parent_ids?: string[]
  stats?: { additions?: number; deletions?: number }
}

interface GlDiffResponse {
  old_path?: string
  new_path?: string
  new_file?: boolean
  deleted_file?: boolean
  renamed_file?: boolean
  diff?: string
}

interface GlPipelineResponse {
  id: number
  name?: string | null
  status?: string
  source?: string | null
  ref?: string | null
  sha?: string | null
  created_at?: string | null
  updated_at?: string | null
  web_url?: string
}

interface GlJobResponse {
  id: number
  name: string
  status?: string
  started_at?: string | null
  finished_at?: string | null
  web_url?: string
}

interface GlEventResponse {
  id: number
  project_id?: number
  created_at?: string | null
  action_name?: string
  action?: string
  target_type?: string | null
  target_title?: string | null
  target_iid?: number
  author?: { username?: string; name?: string; avatar_url?: string | null }
  author_username?: string
  push_data?: {
    commit_count?: number
    commit_title?: string | null
    ref?: string | null
  }
}

interface GlTreeItemResponse {
  id?: string
  name: string
  path: string
  type?: string
}

interface GlBranchResponse {
  name: string
  default?: boolean
  commit?: { id?: string }
}

interface GlFileResponse {
  file_path?: string
  content?: string
  size?: number
}

interface GlMergeRequestChangesResponse {
  changes?: GlDiffResponse[]
}

interface GlMergeTrainCarResponse {
  target_branch?: string
  status?: string
  created_at?: string | null
  merge_request?: {
    iid?: number
    title?: string
    author?: GlUserResponse
    web_url?: string | null
  }
  user?: GlUserResponse
}

interface GlBlobSearchResponse {
  project_id?: number
  path?: string
  filename?: string
  data?: string
}

interface GlTodoTargetResponse extends GlMrStateFields {
  title?: string
  iid?: number
  author?: GlUserResponse
}

interface GlTodoResponse {
  id: number
  action_name?: string
  target_type?: string
  target?: GlTodoTargetResponse
  body?: string
  state?: string
  updated_at?: string | null
  created_at?: string | null
  target_url?: string | null
  project?: {
    path_with_namespace?: string
    path?: string
    namespace?: { full_path?: string }
  }
}

interface GlStarrerResponse {
  user?: { id?: number }
}

// GitLab.com REST API v4. A self-managed host could be supported later by making
// this configurable; for now koinon targets gitlab.com like it targets github.com.
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

function botKindOf(login?: string | null): 'dependabot' | 'renovate' | null {
  const l = String(login ?? '').toLowerCase()
  if (!l) return null
  if (l.includes('dependabot')) return 'dependabot'
  if (l.includes('renovate')) return 'renovate'
  return null
}

function errStatus(e: unknown): number | undefined {
  if (!e || typeof e !== 'object') return undefined
  const err = e as { statusCode?: number; status?: number; response?: { status?: number } }
  return err.statusCode ?? err.status ?? err.response?.status
}

function sortEntries(a: ForgeTreeEntry, b: ForgeTreeEntry): number {
  if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
  return a.name.localeCompare(b.name)
}

function decodeBase64Utf8(b64: string): string {
  const binary = atob(b64.replace(/\s/g, ''))
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function looksBinary(b64: string): boolean {
  try {
    const sample = atob(b64.replace(/\s/g, '').slice(0, 512))
    for (let i = 0; i < sample.length; i++) if (sample.charCodeAt(i) === 0) return true
    return false
  } catch {
    return false
  }
}

function mapUser(u: GlUserResponse | null | undefined): ForgeUser | undefined {
  if (!u) return undefined
  return {
    provider: 'gitlab',
    login: u.username ?? '',
    displayName: u.name ?? null,
    avatarUrl: u.avatar_url ?? null,
    url: u.web_url ?? (u.username ? `${WEB}/${u.username}` : null)
  }
}

function mapRepo(r: GlProjectResponse): ForgeRepo {
  const owner =
    r.namespace?.full_path ??
    String(r.path_with_namespace ?? '')
      .split('/')
      .slice(0, -1)
      .join('/')
  return {
    provider: 'gitlab',
    owner,
    name: r.path,
    fullName: r.path_with_namespace ?? `${owner}/${r.path}`,
    description: r.description ?? null,
    defaultBranch: r.default_branch || 'main',
    url: r.web_url,
    ownerUrl: r.namespace?.web_url,
    ownerAvatar: r.namespace?.avatar_url ?? r.avatar_url ?? null,
    homepage: null,
    language: null,
    topics: r.topics ?? r.tag_list ?? [],
    stars: r.star_count,
    forks: r.forks_count,
    watchers: undefined,
    issues: r.open_issues_count,
    isPrivate: r.visibility ? r.visibility !== 'public' : undefined,
    isFork: !!r.forked_from_project,
    license: r.license?.nickname ?? r.license?.name ?? null,
    createdAt: r.created_at ?? null,
    updatedAt: r.last_activity_at ?? r.updated_at ?? null,
    ref: { id: r.id }
  }
}

function mapCommit(r: GlCommitResponse): ForgeCommit {
  const sha: string = r.id
  const actor: ForgeCommitActor | undefined =
    r.author_name || r.author_email
      ? { name: r.author_name, email: r.author_email, when: r.authored_date ?? r.created_at }
      : undefined
  const committer: ForgeCommitActor | undefined =
    r.committer_name || r.committer_email
      ? { name: r.committer_name, email: r.committer_email, when: r.committed_date ?? r.created_at }
      : undefined
  return {
    sha,
    shortSha: r.short_id ?? (sha ? sha.slice(0, 8) : ''),
    message: r.message ?? r.title ?? '',
    author: actor,
    committer,
    url: r.web_url,
    parents: r.parent_ids ?? []
  }
}

/** Count +/- lines in a GitLab unified-diff body (ignores the file/hunk headers). */
function countDiff(diff?: string): { additions: number; deletions: number } {
  let additions = 0
  let deletions = 0
  for (const line of String(diff ?? '').split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) additions++
    else if (line.startsWith('-') && !line.startsWith('---')) deletions++
  }
  return { additions, deletions }
}

function mapDiff(f: GlDiffResponse): ForgeFileDiff {
  const counts = countDiff(f.diff)
  return {
    oldPath: f.old_path,
    path: f.new_path || f.old_path || '',
    status: f.new_file
      ? 'added'
      : f.deleted_file
        ? 'removed'
        : f.renamed_file
          ? 'renamed'
          : 'modified',
    additions: counts.additions,
    deletions: counts.deletions,
    isBinary: !f.diff,
    patch: f.diff ?? null
  }
}

/** Project web base ("https://gitlab.com/owner/repo") from any project URL. */
function projectBaseOf(webUrl?: string): string {
  if (!webUrl) return ''
  return String(webUrl)
    .replace(/\/-\/.*$/, '')
    .replace(/\/+$/, '')
}

// GitLab stores uploaded attachments (often SVG diagrams) as project-relative
// "/uploads/<hash>/<file>" — a leading slash, but resolved against the project,
// not the domain root — so they 404 when rendered anywhere else. Rewrite them to
// absolute URLs, covering both markdown "](...)" and raw <img src>/href forms.
function absolutizeUploads(md: string | null | undefined, base: string): string | null {
  if (!md) return md ?? null
  if (!base) return md
  return md
    .replace(/(\]\()(\/uploads\/)/g, (_m, p: string, u: string) => `${p}${base}${u}`)
    .replace(
      /((?:src|href)\s*=\s*["'])(\/uploads\/)/g,
      (_m, p: string, u: string) => `${p}${base}${u}`
    )
}

function mapIssue(r: GlIssueResponse): ForgeIssue {
  return {
    provider: 'gitlab',
    id: String(r.iid),
    number: r.iid,
    title: r.title,
    state: r.state === 'closed' ? 'closed' : 'open',
    author: mapUser(r.author),
    body: absolutizeUploads(r.description, projectBaseOf(r.web_url)),
    commentCount: r.user_notes_count,
    labels: (r.labels ?? []).map((l) =>
      typeof l === 'string'
        ? { name: l }
        : { name: l.name, color: l.color, description: l.description }
    ),
    createdAt: r.created_at ?? null,
    updatedAt: r.updated_at ?? null,
    closedAt: r.closed_at ?? null,
    url: r.web_url,
    isPull: false
  }
}

function mrState(r: GlMrStateFields): ForgePullState {
  if (r.state === 'merged' || r.merged_at) return 'merged'
  if (r.state === 'closed') return 'closed'
  if (r.draft || r.work_in_progress) return 'draft'
  return 'open'
}

function mapPull(r: GlMergeRequestResponse): ForgePull {
  return {
    provider: 'gitlab',
    id: String(r.iid),
    number: r.iid,
    title: r.title,
    state: mrState(r),
    author: mapUser(r.author),
    body: absolutizeUploads(r.description, projectBaseOf(r.web_url)),
    commentCount: r.user_notes_count,
    labels: (r.labels ?? []).map((l) =>
      typeof l === 'string' ? { name: l } : { name: l.name, color: l.color }
    ),
    sourceBranch: r.source_branch,
    targetBranch: r.target_branch,
    createdAt: r.created_at ?? null,
    updatedAt: r.updated_at ?? null,
    mergedAt: r.merged_at ?? null,
    closedAt: r.closed_at ?? null,
    url: r.web_url
  }
}

/** GitLab notes → comments, dropping system notes (label changes, etc.). */
function mapNote(r: GlNoteResponse, base = ''): ForgeComment {
  return {
    id: String(r.id),
    author: mapUser(r.author),
    body: absolutizeUploads(r.body, base) ?? '',
    createdAt: r.created_at ?? null
  }
}

function glRunStatus(s?: string): ForgeRunStatus {
  switch (s) {
    case 'success':
      return 'success'
    case 'failed':
      return 'failure'
    case 'canceled':
    case 'cancelled':
      return 'cancelled'
    case 'skipped':
      return 'skipped'
    case 'running':
      return 'running'
    case 'pending':
    case 'created':
    case 'waiting_for_resource':
    case 'preparing':
    case 'scheduled':
      return 'pending'
    case 'manual':
      return 'queued'
    default:
      return 'unknown'
  }
}

function mapPipeline(r: GlPipelineResponse): ForgeActionRun {
  return {
    provider: 'gitlab',
    id: String(r.id),
    name: r.name || `Pipeline #${r.id}`,
    status: glRunStatus(r.status),
    event: r.source,
    branch: r.ref,
    commitSha: r.sha,
    createdAt: r.created_at ?? null,
    updatedAt: r.updated_at ?? null,
    url: r.web_url
  }
}

function mapJob(j: GlJobResponse): ForgeActionJob {
  return {
    id: String(j.id),
    name: j.name,
    status: glRunStatus(j.status),
    startedAt: j.started_at ?? null,
    completedAt: j.finished_at ?? null,
    url: j.web_url
  }
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

/** Map a GitLab events-API item into a normalized contribution (or null). */
function mapEvent(
  e: GlEventResponse,
  repoIndex: Map<number, GlProjectResponse>
): ForgeContribution | null {
  const actor = mapUser({
    username: e.author?.username ?? e.author_username,
    name: e.author?.name,
    avatar_url: e.author?.avatar_url
  })
  if (!actor) return null
  const proj = e.project_id != null ? repoIndex.get(e.project_id) : undefined
  const owner = proj?.namespace?.full_path ?? ''
  const name = proj?.path ?? ''
  const fullName = proj?.path_with_namespace ?? (owner && name ? `${owner}/${name}` : '')
  if (!fullName) return null
  const repo = { owner, name, fullName, url: proj?.web_url ?? `${WEB}/${fullName}` }
  const base = {
    provider: 'gitlab' as const,
    id: String(e.id),
    actor,
    repo,
    createdAt: String(e.created_at ?? '')
  }

  const action = String(e.action_name ?? e.action ?? '')
  const target = String(e.target_type ?? '')
  let kind: ForgeEventKind
  let title: string | null | undefined = e.target_title
  let url: string | null | undefined
  const number: number | undefined = e.target_iid
  let count: number | undefined

  if (e.push_data || action === 'pushed to' || action === 'pushed new') {
    kind = 'push'
    count = e.push_data?.commit_count
    title = e.push_data?.commit_title
    const ref = e.push_data?.ref
    url = ref ? `${WEB}/${fullName}/-/commits/${ref}` : `${WEB}/${fullName}`
  } else if (target === 'MergeRequest') {
    kind = action === 'merged' ? 'pr_merged' : action === 'opened' ? 'pr_opened' : 'other'
    url = number ? `${WEB}/${fullName}/-/merge_requests/${number}` : undefined
  } else if (target === 'Issue') {
    kind = action === 'closed' ? 'issue_closed' : action === 'opened' ? 'issue_opened' : 'other'
    url = number ? `${WEB}/${fullName}/-/issues/${number}` : undefined
  } else if (target === 'Note' || target === 'DiscussionNote') {
    kind = 'comment'
  } else if (action === 'created' || action === 'joined') {
    kind = 'create'
    url = repo.url
  } else {
    return null
  }

  return { ...base, kind, title, url, number, count, impact: EVENT_IMPACT[kind] }
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
    mergeQueue: true
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
    const [issue, notes] = await Promise.all([
      glFetch<GlIssueResponse>(`/projects/${pid}/issues/${id}`, undefined, opts),
      glFetch<GlNoteResponse[]>(
        `/projects/${pid}/issues/${id}/notes`,
        { per_page: 100, sort: 'asc', order_by: 'created_at' },
        opts
      ).catch(() => [])
    ])
    return {
      ...mapIssue(issue),
      comments: (notes ?? [])
        .filter((n) => !n.system)
        .map((n) => mapNote(n, projectBaseOf(issue.web_url)))
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
    const [mr, notes] = await Promise.all([
      glFetch<GlMergeRequestResponse>(`/projects/${pid}/merge_requests/${id}`, undefined, opts),
      glFetch<GlNoteResponse[]>(
        `/projects/${pid}/merge_requests/${id}/notes`,
        { per_page: 100, sort: 'asc', order_by: 'created_at' },
        opts
      ).catch(() => [])
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
        .map((n) => mapNote(n, projectBaseOf(mr.web_url)))
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
    const data = await glFetch<GlProjectResponse[]>(
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
    const data = await glFetch<GlUserResponse[]>(
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

/** Derive owner/name/fullName from a global MR/issue payload. */
function workRepo(r: GlIssueResponse | GlMergeRequestResponse): {
  provider: ForgeId
  owner: string
  name: string
  fullName: string
  url?: string
} {
  let path = String(r.references?.full ?? '').split(/[!#]/)[0] ?? ''
  if (!path && r.web_url) {
    const m = String(r.web_url).match(/https?:\/\/[^/]+\/(.+?)\/-\//)
    path = m?.[1] ?? ''
  }
  const idx = path.lastIndexOf('/')
  return {
    provider: 'gitlab',
    owner: idx >= 0 ? path.slice(0, idx) : path,
    name: idx >= 0 ? path.slice(idx + 1) : path,
    fullName: path
  }
}

/** Global MR/issue payload → ForgeIssue with repo, for the home dashboard. */
function workItem(r: GlIssueResponse | GlMergeRequestResponse, isPull: boolean): ForgeIssue {
  return {
    provider: 'gitlab',
    id: String(r.iid),
    number: r.iid,
    title: r.title ?? '(untitled)',
    state: r.state === 'closed' || r.state === 'merged' ? 'closed' : 'open',
    author: mapUser(r.author),
    commentCount: r.user_notes_count,
    createdAt: r.created_at ?? null,
    updatedAt: r.updated_at ?? null,
    url: r.web_url,
    isPull,
    repo: workRepo(r)
  }
}

function todoKind(t: GlTodoResponse): ForgeNotification['kind'] {
  if (t.action_name === 'build_failed' || t.target_type === 'Pipeline') return 'ci'
  switch (t.target_type) {
    case 'MergeRequest':
      return 'pull'
    case 'Issue':
      return 'issue'
    case 'Commit':
      return 'commit'
    default:
      return 'other'
  }
}

function todoRepo(t: GlTodoResponse): { owner: string; name: string; fullName: string } {
  const full = String(t.project?.path_with_namespace ?? '')
  const owner = t.project?.namespace?.full_path ?? full.split('/').slice(0, -1).join('/')
  const name = t.project?.path ?? full.split('/').pop() ?? ''
  return { owner, name, fullName: full }
}

function todoRoute(
  t: GlTodoResponse,
  kind: ForgeNotification['kind'],
  owner: string,
  name: string
): string | null {
  if (!owner || !name) return null
  const base = `/gitlab/${owner}/${name}`
  const number = t.target?.iid
  if (kind === 'ci') return `${base}/actions`
  if (kind === 'pull' && number) return `${base}/pulls/${number}`
  if (kind === 'issue' && number) return `${base}/issues/${number}`
  // Wikis, designs, epics, docs, … have no in-app view — fall back to the
  // provider's own page (callers use `url` when `to` is null).
  return null
}

const TODO_REASONS: Record<string, string> = {
  assigned: 'assign',
  review_requested: 'review_requested',
  mentioned: 'mention',
  directly_addressed: 'mention',
  build_failed: 'ci_failure',
  marked: 'author',
  approval_required: 'review_requested'
}

function mapTodoReason(action?: string): string | undefined {
  return action ? (TODO_REASONS[action] ?? action) : undefined
}
