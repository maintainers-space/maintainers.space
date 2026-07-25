import type {
  ForgeBranch,
  ForgeBlob,
  ForgeCommit,
  ForgeCommitActor,
  ForgeCommitDetail,
  ForgeComment,
  ForgeContribution,
  ForgeEventKind,
  ForgeFileDiff,
  ForgeInboxItem,
  ForgeIssue,
  ForgeIssueDetail,
  ForgeMergeResult,
  ForgeMyWork,
  ForgeNotification,
  ForgePull,
  ForgePullDetail,
  ForgePullState,
  ForgeProvider,
  ForgeReadOptions,
  ForgeRepo,
  ForgeSearchOptions,
  ForgeTreeEntry,
  ForgeUser,
  Paginated
} from '~/types/forge'

import { getForgeToken } from '~/lib/forges/token-store'

const API = 'https://codeberg.org/api/v1'
const WEB = 'https://codeberg.org'

// Raw Codeberg/Forgejo (Gitea-flavored) REST API response shapes.
// These model only the fields this file actually reads; Gitea is inconsistent
// about optionality (e.g. `login` vs `username`), so most fields are optional.

interface CbUserResponse {
  login?: string
  username?: string
  full_name?: string | null
  fullname?: string | null
  avatar_url?: string | null
  html_url?: string | null
}

/** The nested git-level author/committer identity on a commit (name/email/date, no account info). */
interface CbGitActor {
  name?: string
  email?: string
  date?: string
  timestamp?: string
}

/**
 * `mapCommitActor`'s first argument is sometimes the git-level actor
 * (`commit.author`, with name/email/date) and sometimes falls back to the
 * top-level account object (`author`, with login/avatar_url) depending on
 * which Codeberg/Gitea endpoint produced the commit. Merge both shapes so
 * either can be passed without a weak-type mismatch.
 */
interface CbCommitActorRaw {
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

interface CbRepoResponse {
  owner?: CbUserResponse | null
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

interface CbTopicsResponse {
  topics?: string[]
}

/** Minimal repo reference embedded in events/notifications/search results. */
interface CbRepoRefResponse {
  owner?: CbUserResponse | null
  name?: string
  full_name?: string
  html_url?: string
}

/** A repo reference that may be embedded directly or nested under `repository`/`repo`. */
interface CbRepoRefContainer extends CbRepoRefResponse {
  repository?: CbRepoRefResponse
  repo?: CbRepoRefResponse
}

interface CbLabelResponse {
  name: string
  color?: string | null
  description?: string | null
}

interface CbIssueResponse {
  number?: number
  index?: number
  title?: string
  state?: string
  user?: CbUserResponse | null
  body?: string | null
  comments?: number
  labels?: (CbLabelResponse | string)[]
  created_at?: string | null
  updated_at?: string | null
  closed_at?: string | null
  html_url?: string
  pull_request?: unknown
}

interface CbPullResponse extends CbIssueResponse {
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
interface CbSearchIssueResponse extends CbIssueResponse {
  repository?: CbRepoRefResponse
  repo?: CbRepoRefResponse
}

interface CbCommentResponse {
  id?: number | string
  user?: CbUserResponse | null
  body?: string | null
  created_at?: string | null
  html_url?: string | null
}

interface CbCommitResponse {
  sha?: string
  id?: string
  commit?: {
    message?: string
    author?: CbGitActor
    committer?: CbGitActor
  }
  message?: string
  author?: CbUserResponse | null
  committer?: CbUserResponse | null
  html_url?: string | null
  parents?: { sha?: string; id?: string }[]
}

/** The `/git/commits/{sha}` endpoint returns a commit plus diff stat/files. */
interface CbGitCommitResponse extends CbCommitResponse {
  stats?: { additions?: number; deletions?: number; total?: number }
  files?: CbFileDiffResponse[]
}

interface CbFileDiffResponse {
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
interface CbContentResponse {
  name?: string
  path?: string
  type?: string
  size?: number
  sha?: string
  content?: string
}

interface CbBranchResponse {
  name: string
  commit?: { id?: string; message?: string; timestamp?: string }
}

/** A single entry from the user activity feed (`/users/{login}/activities/feeds`). */
interface CbActivityResponse {
  id?: number | string
  op_type?: string
  act_user?: CbUserResponse | null
  repo?: CbRepoRefResponse
  content?: string | null
  ref_name?: string | null
  created?: string
  created_at?: string
}

interface CbNotificationResponse {
  id: number | string
  subject?: {
    type?: string
    title?: string
    url?: string
    html_url?: string
    state?: string
  }
  repository?: CbRepoRefResponse
  reason?: string | null
  unread?: boolean
  updated_at?: string
}

interface CbSearchReposResponse {
  ok?: boolean
  data?: CbRepoResponse[]
}

interface CbSearchUsersResponse {
  ok?: boolean
  data?: CbUserResponse[]
}

function cbHeaders(opts?: ForgeReadOptions): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = opts?.token ?? getForgeToken('codeberg')
  if (token) {
    headers.Authorization = 'Bearer ' + token
  }
  return headers
}

async function cbMapLimit<T, R>(
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

function loginOf(u: CbUserResponse | null | undefined): string {
  return String(u?.login ?? u?.username ?? '')
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

function contentUrl(owner: string, repo: string, path: string): string {
  const enc = encodePath(path)
  return enc
    ? `${API}/repos/${owner}/${repo}/contents/${enc}`
    : `${API}/repos/${owner}/${repo}/contents`
}

function mapUser(u: CbUserResponse | null | undefined): ForgeUser | undefined {
  if (!u) {
    return undefined
  }
  const login = loginOf(u)
  return {
    provider: 'codeberg',
    login,
    displayName: u.full_name ?? u.fullname ?? null,
    avatarUrl: u.avatar_url ?? null,
    url: u.html_url ?? (login ? `${WEB}/${login}` : null)
  }
}

function mapCommitActor(
  gitActor: CbCommitActorRaw | null | undefined,
  user: CbUserResponse | null | undefined
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

function mapRepo(r: CbRepoResponse): ForgeRepo {
  const owner = loginOf(r.owner)
  return {
    provider: 'codeberg',
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

function mapLabel(l: CbLabelResponse | string): {
  name: string
  color?: string | null
  description?: string | null
} {
  if (typeof l === 'string') {
    return { name: l }
  }
  return { name: l.name, color: l.color, description: l.description }
}

function mapIssue(r: CbIssueResponse): ForgeIssue {
  return {
    provider: 'codeberg',
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

function pullState(r: CbPullResponse): ForgePullState {
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

function mapPull(r: CbPullResponse): ForgePull {
  return {
    provider: 'codeberg',
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

function mapComment(r: CbCommentResponse): ForgeComment {
  return {
    id: String(r.id),
    author: mapUser(r.user),
    body: r.body ?? '',
    createdAt: r.created_at ?? null,
    url: r.html_url
  }
}

function mapCommit(r: CbCommitResponse): ForgeCommit {
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

function mapFileDiff(f: CbFileDiffResponse, patch?: string | null): ForgeFileDiff {
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
  const data = await $fetch<CbContentResponse | CbContentResponse[]>(contentUrl(owner, repo, ''), {
    headers: cbHeaders(opts),
    query: ref ? { ref } : undefined,
    signal: opts?.signal
  })
  const arr = Array.isArray(data) ? data : [data]
  return arr
    .map(
      (e: CbContentResponse): ForgeTreeEntry => ({
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
    const r = await $fetch<CbContentResponse>(contentUrl(owner, repo, readme.path), {
      headers: cbHeaders(opts),
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
  r: CbRepoRefContainer | undefined
):
  | { provider: 'codeberg'; owner: string; name: string; fullName: string; url?: string }
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
    provider: 'codeberg',
    owner,
    name,
    fullName: fullName || `${owner}/${name}`,
    url: raw?.html_url ?? `${WEB}/${owner}/${name}`
  }
}

function mapSearchIssue(r: CbSearchIssueResponse, isPull?: boolean): ForgeIssue {
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
      provider: 'codeberg',
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

function mapEvent(e: CbActivityResponse): ForgeContribution | null {
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
    provider: 'codeberg',
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

async function cbFetch<T>(
  path: string,
  query?: Record<string, unknown>,
  opts?: ForgeReadOptions
): Promise<T> {
  return (await $fetch(`${API}${path}`, {
    headers: cbHeaders(opts),
    query,
    signal: opts?.signal
  })) as T
}

export const codebergProvider: ForgeProvider = {
  id: 'codeberg',
  label: 'Codeberg',
  icon: 'i-simple-icons-codeberg',
  color: '#2185d0',
  ownerLabel: 'Owner',
  ownerPlaceholder: 'e.g. forgejo',
  repoPlaceholder: 'e.g. forgejo',
  capabilities: {
    code: true,
    issues: true,
    pulls: true,
    discussions: false,
    actions: false,
    repoSearch: true,
    issueSearch: true,
    codeSearch: false,
    userSearch: true,
    discussionSearch: false,
    star: true,
    mergeQueue: false
  },
  webUrl: (owner, repo) => `${WEB}/${owner}/${repo}`,
  ownerWebUrl: (owner) => `${WEB}/${owner}`,

  async getRepo(owner, repo, opts) {
    const [raw, languages, topics] = await Promise.all([
      cbFetch<CbRepoResponse>(`/repos/${owner}/${repo}`, undefined, opts),
      cbFetch<Record<string, number>>(`/repos/${owner}/${repo}/languages`, undefined, opts).catch(
        () => null
      ),
      cbFetch<CbTopicsResponse>(`/repos/${owner}/${repo}/topics`, undefined, opts).catch(() => null)
    ])
    const mapped = mapRepo(raw)
    mapped.language = topLanguage(languages)
    mapped.topics = raw.topics ?? topics?.topics ?? []
    return mapped
  },

  async getOverview(owner, repo, opts) {
    const meta = await codebergProvider.getRepo!(owner, repo, opts)
    const entries = await getRootTree(owner, repo, meta.defaultBranch, opts).catch(
      () => [] as ForgeTreeEntry[]
    )
    const readme = await getReadme(owner, repo, meta.defaultBranch, entries, opts)
    return { repo: meta, entries, readme }
  },

  async listRepos(owner, opts) {
    const data = await cbFetch<CbRepoResponse[]>(
      `/users/${owner}/repos`,
      { limit: 60, page: 1, sort: 'updated' },
      opts
    ).catch(() => [])
    return (data ?? []).map(mapRepo)
  },

  async listBranches(repo, opts) {
    const data = await cbFetch<CbBranchResponse[]>(
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
    const data = await $fetch<CbContentResponse | CbContentResponse[]>(
      contentUrl(repo.owner, repo.name, path),
      {
        headers: cbHeaders(opts),
        query: { ref },
        signal: opts?.signal
      }
    )
    const arr = Array.isArray(data) ? data : [data]
    return arr
      .map(
        (e: CbContentResponse): ForgeTreeEntry => ({
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
    const r = await $fetch<CbContentResponse>(contentUrl(repo.owner, repo.name, path), {
      headers: cbHeaders(opts),
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
    const data = await cbFetch<CbCommitResponse[]>(
      `/repos/${repo.owner}/${repo.name}/commits`,
      { sha: ref, page, limit },
      opts
    )
    const items = (data ?? []).map(mapCommit)
    return { items, cursor: items.length === limit ? String(page + 1) : undefined }
  },

  async getCommit(repo, sha, opts) {
    const [r, diffText] = await Promise.all([
      cbFetch<CbGitCommitResponse>(
        `/repos/${repo.owner}/${repo.name}/git/commits/${sha}`,
        { stat: true, files: true, verification: false },
        opts
      ),
      $fetch<string>(`${API}/repos/${repo.owner}/${repo.name}/git/commits/${sha}.diff`, {
        headers: cbHeaders(opts),
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
      files: (r.files ?? []).map((f: CbFileDiffResponse) =>
        mapFileDiff(f, patches[f.filename ?? ''] ?? null)
      )
    } satisfies ForgeCommitDetail
  },

  async listIssues(repo, opts) {
    const limit = opts?.limit ?? 30
    const page = opts?.cursor ? Number(opts.cursor) : 1
    const data = await cbFetch<CbIssueResponse[]>(
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
    const [issue, comments] = await Promise.all([
      cbFetch<CbIssueResponse>(`/repos/${repo.owner}/${repo.name}/issues/${id}`, undefined, opts),
      cbFetch<CbCommentResponse[]>(
        `/repos/${repo.owner}/${repo.name}/issues/${id}/comments`,
        { limit: 100 },
        opts
      ).catch(() => [])
    ])
    return { ...mapIssue(issue), comments: (comments ?? []).map(mapComment) }
  },

  async listPulls(repo, opts) {
    const limit = opts?.limit ?? 30
    const page = opts?.cursor ? Number(opts.cursor) : 1
    const state =
      opts?.state === 'merged' || opts?.state === 'draft' ? 'all' : (opts?.state ?? 'open')
    const data = await cbFetch<CbPullResponse[]>(
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
    const [pr, comments, commits] = await Promise.all([
      cbFetch<CbPullResponse>(`/repos/${repo.owner}/${repo.name}/pulls/${id}`, undefined, opts),
      cbFetch<CbCommentResponse[]>(
        `/repos/${repo.owner}/${repo.name}/issues/${id}/comments`,
        { limit: 100 },
        opts
      ).catch(() => []),
      cbFetch<CbCommitResponse[]>(
        `/repos/${repo.owner}/${repo.name}/pulls/${id}/commits`,
        { limit: 100 },
        opts
      ).catch(() => [])
    ])
    return {
      ...mapPull(pr),
      stat: { additions: pr.additions, deletions: pr.deletions, filesChanged: pr.changed_files },
      commitCount: pr.commits ?? commits.length,
      comments: (comments ?? []).map(mapComment)
    }
  },

  async getPullFiles(repo, id, opts) {
    const data = await cbFetch<CbFileDiffResponse[]>(
      `/repos/${repo.owner}/${repo.name}/pulls/${id}/files`,
      { limit: 100 },
      opts
    )
    return (data ?? []).map((f: CbFileDiffResponse) => mapFileDiff(f))
  },

  async getPullCommits(repo, id, opts) {
    const data = await cbFetch<CbCommitResponse[]>(
      `/repos/${repo.owner}/${repo.name}/pulls/${id}/commits`,
      { limit: 100 },
      opts
    )
    return (data ?? []).map(mapCommit)
  },

  async searchRepos(q, opts): Promise<Paginated<ForgeRepo>> {
    const page = opts?.cursor ? Number(opts.cursor) : 1
    const limit = opts?.limit ?? 20
    const data = await cbFetch<CbSearchReposResponse>(
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
    const data = await cbFetch<CbSearchIssueResponse[]>(
      `/repos/issues/search`,
      { q, type: 'issues', state: 'open', page, limit },
      opts
    )
    const items = (data ?? []).map((r: CbSearchIssueResponse) => mapSearchIssue(r, false))
    return { items, cursor: items.length === limit ? String(page + 1) : undefined }
  },

  async searchUsers(q, opts): Promise<Paginated<ForgeUser>> {
    const page = opts?.cursor ? Number(opts.cursor) : 1
    const limit = opts?.limit ?? 20
    const data = await cbFetch<CbSearchUsersResponse>(`/users/search`, { q, page, limit }, opts)
    const items = (data?.data ?? [])
      .map(mapUser)
      .filter((u: ForgeUser | undefined): u is ForgeUser => !!u)
    return { items, cursor: items.length === limit ? String(page + 1) : undefined }
  },

  async listNotifications(opts): Promise<ForgeNotification[]> {
    const token = opts?.token ?? getForgeToken('codeberg')
    if (!token) {
      return []
    }
    const page = opts?.cursor ? Number(opts.cursor) : 1
    const data = await cbFetch<CbNotificationResponse[]>(
      `/notifications`,
      { all: false, 'status-types': 'unread', page: page, limit: opts?.limit ?? 30 },
      { ...opts, token }
    )
    return (data ?? []).map((n: CbNotificationResponse): ForgeNotification => {
      const repo = repoFromRaw(n.repository)
      const kind = notificationKind(String(n.subject?.type ?? ''))
      const number = notificationNumber(n.subject?.url ?? n.subject?.html_url)
      const to = repo ? notificationRoute(kind, repo.owner, repo.name, number) : null
      return {
        provider: 'codeberg',
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
    const token = opts?.token ?? getForgeToken('codeberg')
    if (!token) {
      return []
    }
    const headers = cbHeaders({ ...opts, token })
    const [raw, me] = await Promise.all([
      $fetch<CbNotificationResponse[]>(`${API}/notifications`, {
        headers,
        query: { all: false, 'status-types': 'unread', limit: opts?.limit ?? 50 },
        signal: opts?.signal
      }).catch(() => []),
      $fetch<CbUserResponse | null>(`${API}/user`, { headers, signal: opts?.signal }).catch(
        () => null
      )
    ])
    const myLogin = loginOf(me).toLowerCase()
    const items = await cbMapLimit(raw ?? [], 6, async (n): Promise<ForgeInboxItem | null> => {
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
        provider: 'codeberg',
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
        const subj = await $fetch<CbPullResponse>(
          `${API}/repos/${repo.owner}/${repo.name}/${path}/${number}`,
          { headers, signal: opts?.signal }
        )
        const resolved =
          kind === 'pull'
            ? !!(subj.merged_at || subj.merged || subj.state === 'closed')
            : subj.state === 'closed'
        item.state = kind === 'pull' ? pullState(subj) : subj.state === 'closed' ? 'closed' : 'open'
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
          const comments = await $fetch<CbCommentResponse[]>(
            `${API}/repos/${repo.owner}/${repo.name}/issues/${number}/comments`,
            {
              headers,
              query: { limit: 100 },
              signal: opts?.signal
            }
          ).catch(() => [])
          item.unreadComments = (comments ?? [])
            .filter((c: CbCommentResponse) => loginOf(c.user).toLowerCase() !== myLogin)
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
      headers: cbHeaders(opts),
      signal: opts?.signal
    }).catch(() => {})
  },

  async createComment(repo, id, body, opts): Promise<ForgeComment> {
    const c = await $fetch<CbCommentResponse>(
      `${API}/repos/${repo.owner}/${repo.name}/issues/${id}/comments`,
      {
        method: 'POST',
        headers: cbHeaders(opts),
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
      headers: cbHeaders(opts),
      body,
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
          headers: cbHeaders(opts),
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
    const token = opts?.token ?? getForgeToken('codeberg')
    if (!token) {
      return false
    }
    try {
      await $fetch(`${API}/user/starred/${repo.owner}/${repo.name}`, {
        headers: cbHeaders({ ...opts, token }),
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
      headers: cbHeaders(opts),
      signal: opts?.signal
    })
    return { starred }
  },

  async listFollowedRepos(opts): Promise<ForgeRepo[]> {
    const token = opts?.token ?? getForgeToken('codeberg')
    if (!token) {
      return []
    }
    const following = await cbFetch<CbUserResponse[]>(
      `/user/following`,
      { limit: 100 },
      { ...opts, token }
    ).catch(() => [])
    const perOwner = await cbMapLimit((following ?? []).slice(0, 20), 6, async (u) => {
      const login = loginOf(u)
      if (!login) {
        return [] as ForgeRepo[]
      }
      const data = await cbFetch<CbRepoResponse[]>(
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
    const token = opts?.token ?? getForgeToken('codeberg')
    if (!token) {
      return []
    }
    const data = await cbFetch<CbUserResponse[]>(
      `/user/following`,
      { limit: opts?.limit ?? 100 },
      { ...opts, token }
    ).catch(() => [])
    return (data ?? []).map(mapUser).filter((u): u is ForgeUser => !!u)
  },

  async listUserEvents(login, opts): Promise<ForgeContribution[]> {
    const limit = Math.min(opts?.limit ?? 100, 100)
    const page = opts?.cursor ? Number(opts.cursor) : 1
    const data = await cbFetch<CbActivityResponse[]>(
      `/users/${encodeURIComponent(login)}/activities/feeds`,
      { 'only-performed-by': true, page, limit },
      opts
    ).catch(() => [])
    return (data ?? []).map(mapEvent).filter((c): c is ForgeContribution => !!c)
  },

  async listMyWork(opts): Promise<ForgeMyWork> {
    const token = opts?.token ?? getForgeToken('codeberg')
    if (!token) {
      return { authoredPulls: [], reviewRequests: [], assignedIssues: [] }
    }
    const run = (query: Record<string, unknown>, isPull: boolean): Promise<ForgeIssue[]> =>
      cbFetch<CbSearchIssueResponse[]>(`/repos/issues/search`, query, { ...opts, token })
        .then((items) => (items ?? []).map((r: CbSearchIssueResponse) => mapSearchIssue(r, isPull)))
        .catch(() => [] as ForgeIssue[])
    const [authoredPulls, reviewRequests, assignedIssues] = await Promise.all([
      run({ type: 'pulls', state: 'open', created: true, limit: 50 }, true),
      run({ type: 'pulls', state: 'open', review_requested: true, limit: 50 }, true),
      run({ type: 'issues', state: 'open', assigned: true, limit: 50 }, false)
    ])
    return { authoredPulls, reviewRequests, assignedIssues }
  }
}
