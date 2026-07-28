import type {
  ForgeBranch,
  ForgeBlob,
  ForgeCommit,
  ForgeCommitActor,
  ForgeCommitDetail,
  ForgeComment,
  ForgeFileDiff,
  ForgeId,
  ForgeMergeResult,
  ForgeMyWork,
  ForgePull,
  ForgePullDetail,
  ForgePullState,
  ForgeProvider,
  ForgeReadOptions,
  ForgeRepo,
  ForgeTreeEntry,
  ForgeUser
} from '~/types/forge'

import { getForgeToken } from '~/lib/forges/token-store'

// Bitbucket Cloud REST API v2.0. Bitbucket's "owner" concept is a *workspace*,
// not a personal account — a workspace can be a team or an individual.
//
// Real, permanent gaps versus GitHub/GitLab/Codeberg (not oversights — verified
// against current Atlassian docs and changelog):
//   - Issues: Bitbucket's native issue tracker is being deleted by Atlassian
//     (data removal already scheduled); not worth building against.
//   - Notifications, a per-user activity feed, and a follow/followers graph:
//     none exist in the Cloud API at all (the follow graph was removed in 2019
//     for GDPR reasons).
//   - Code search and cross-workspace repository search: both deprecated/sunset
//     by Atlassian; only per-workspace repo listing remains.
//   - Star: Bitbucket has "watchers", not "stars", and the write endpoint's
//     behavior is unconfirmed — left unimplemented rather than guessed at.
const API = 'https://api.bitbucket.org/2.0'
const WEB = 'https://bitbucket.org'

interface BbLinkResponse {
  href?: string
}

interface BbLinksResponse {
  html?: BbLinkResponse
  self?: BbLinkResponse
  avatar?: BbLinkResponse
}

/** An account (user) reference — Bitbucket dropped stable usernames in 2019; nickname is the closest analog. */
interface BbAccountResponse {
  uuid?: string
  account_id?: string
  display_name?: string | null
  nickname?: string | null
  links?: BbLinksResponse
}

interface BbWorkspaceRefResponse {
  slug?: string
  name?: string
  links?: BbLinksResponse
}

interface BbRepoResponse {
  name?: string
  slug?: string
  full_name?: string
  description?: string | null
  is_private?: boolean
  language?: string | null
  mainbranch?: { name?: string }
  workspace?: BbWorkspaceRefResponse
  website?: string | null
  created_on?: string | null
  updated_on?: string | null
  links?: BbLinksResponse
  parent?: unknown
}

interface BbPageResponse<T> {
  values?: T[]
  next?: string
}

interface BbCommitResponse {
  hash?: string
  message?: string
  author?: { raw?: string; user?: BbAccountResponse }
  date?: string
  parents?: { hash?: string }[]
  links?: BbLinksResponse
}

interface BbBranchResponse {
  name?: string
  target?: { hash?: string }
}

interface BbSrcEntryResponse {
  path?: string
  type?: string
  size?: number
}

interface BbRepoRefResponse {
  full_name?: string
  links?: BbLinksResponse
}

interface BbPrResponse {
  id?: number
  title?: string
  description?: string | null
  state?: string
  author?: BbAccountResponse
  source?: { branch?: { name?: string }; repository?: BbRepoRefResponse }
  destination?: { branch?: { name?: string }; repository?: BbRepoRefResponse }
  created_on?: string | null
  updated_on?: string | null
  comment_count?: number
  links?: BbLinksResponse
}

interface BbDiffstatEntryResponse {
  status?: string
  old?: { path?: string } | null
  new?: { path?: string } | null
  lines_added?: number
  lines_removed?: number
}

interface BbCommentResponse {
  id?: number
  user?: BbAccountResponse
  content?: { raw?: string }
  created_on?: string | null
  links?: BbLinksResponse
}

interface BbWorkspaceResponse {
  slug?: string
}

function bbHeaders(opts?: ForgeReadOptions): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = opts?.token ?? getForgeToken('bitbucket')
  if (token) headers.Authorization = 'Bearer ' + token
  return headers
}

function encodePath(path: string): string {
  return path.split('/').filter(Boolean).map(encodeURIComponent).join('/')
}

/** `login` for a Bitbucket account: nickname (the closest thing left to a stable handle) or the account UUID. */
function loginOf(u: BbAccountResponse | null | undefined): string {
  return String(u?.nickname ?? u?.uuid ?? '')
}

function mapUser(u: BbAccountResponse | null | undefined): ForgeUser | undefined {
  if (!u) return undefined
  return {
    provider: 'bitbucket',
    login: loginOf(u),
    displayName: u.display_name ?? null,
    avatarUrl: u.links?.avatar?.href ?? null,
    url: u.links?.html?.href ?? null
  }
}

function mapRepo(r: BbRepoResponse): ForgeRepo {
  const workspace = r.workspace?.slug ?? String(r.full_name ?? '').split('/')[0] ?? ''
  const name = r.slug ?? r.name ?? ''
  return {
    provider: 'bitbucket',
    owner: workspace,
    name,
    fullName: r.full_name ?? (workspace && name ? `${workspace}/${name}` : ''),
    description: r.description ?? null,
    defaultBranch: r.mainbranch?.name || 'main',
    url: r.links?.html?.href ?? `${WEB}/${workspace}/${name}`,
    ownerUrl: r.workspace?.links?.html?.href,
    ownerAvatar: r.workspace?.links?.avatar?.href ?? null,
    homepage: r.website || null,
    language: r.language || null,
    topics: [],
    isPrivate: r.is_private,
    isFork: !!r.parent,
    license: null,
    createdAt: r.created_on ?? null,
    updatedAt: r.updated_on ?? null
  }
}

function repoRefFrom(
  r: BbRepoRefResponse | undefined
): { provider: ForgeId; owner: string; name: string; fullName: string; url?: string } | undefined {
  const fullName = r?.full_name
  if (!fullName) return undefined
  const idx = fullName.indexOf('/')
  if (idx < 0) return undefined
  return {
    provider: 'bitbucket',
    owner: fullName.slice(0, idx),
    name: fullName.slice(idx + 1),
    fullName,
    url: r?.links?.html?.href
  }
}

function pullState(s?: string): ForgePullState {
  switch (s) {
    case 'MERGED':
      return 'merged'
    case 'DECLINED':
    case 'SUPERSEDED':
      return 'closed'
    default:
      return 'open'
  }
}

function mapPull(r: BbPrResponse): ForgePull {
  const state = pullState(r.state)
  return {
    provider: 'bitbucket',
    id: String(r.id ?? ''),
    number: r.id,
    title: r.title ?? '',
    state,
    author: mapUser(r.author),
    body: r.description ?? null,
    commentCount: r.comment_count,
    sourceBranch: r.source?.branch?.name,
    targetBranch: r.destination?.branch?.name,
    createdAt: r.created_on ?? null,
    updatedAt: r.updated_on ?? null,
    mergedAt: state === 'merged' ? (r.updated_on ?? null) : null,
    closedAt: state === 'closed' ? (r.updated_on ?? null) : null,
    url: r.links?.html?.href,
    repo: repoRefFrom(r.destination?.repository)
  }
}

function mapComment(r: BbCommentResponse): ForgeComment {
  return {
    id: String(r.id ?? ''),
    author: mapUser(r.user),
    body: r.content?.raw ?? '',
    createdAt: r.created_on ?? null,
    url: r.links?.html?.href
  }
}

/** Bitbucket's commit `author.raw` is a raw git identity string: "Name <email>". */
function mapCommit(r: BbCommitResponse): ForgeCommit {
  const sha = r.hash ?? ''
  const raw = r.author?.raw ?? ''
  const m = raw.match(/^(.*?)\s*<(.+)>\s*$/)
  const actor: ForgeCommitActor = {
    name: r.author?.user?.display_name ?? m?.[1] ?? raw,
    email: m?.[2],
    login: r.author?.user ? loginOf(r.author.user) || undefined : undefined,
    avatarUrl: r.author?.user?.links?.avatar?.href ?? null,
    when: r.date
  }
  return {
    sha,
    shortSha: sha.slice(0, 7),
    message: r.message ?? '',
    author: actor,
    committer: actor,
    url: r.links?.html?.href,
    parents: (r.parents ?? []).map((p) => p.hash ?? '').filter(Boolean)
  }
}

function diffFileStatus(status?: string): ForgeFileDiff['status'] {
  switch (status) {
    case 'added':
      return 'added'
    case 'removed':
      return 'removed'
    case 'renamed':
      return 'renamed'
    case 'modified':
      return 'modified'
    default:
      return 'changed'
  }
}

function mapDiffstat(d: BbDiffstatEntryResponse): ForgeFileDiff {
  return {
    oldPath: d.old?.path,
    path: d.new?.path ?? d.old?.path ?? '',
    status: diffFileStatus(d.status),
    additions: d.lines_added,
    deletions: d.lines_removed,
    isBinary: false
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
    if (path) out[path] = part
  }
  return out
}

function sortEntries(a: ForgeTreeEntry, b: ForgeTreeEntry): number {
  if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
  return a.name.localeCompare(b.name)
}

function mapTreeEntry(e: BbSrcEntryResponse): ForgeTreeEntry {
  const path = e.path ?? ''
  return {
    name: path.split('/').pop() || path,
    path,
    type: e.type === 'commit_directory' ? 'dir' : 'file',
    size: e.size
  }
}

/** Bounded-concurrency map, mirroring the pattern used across every other forge client. */
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

async function bbFetch<T>(
  path: string,
  query?: Record<string, unknown>,
  opts?: ForgeReadOptions
): Promise<T> {
  return (await $fetch(`${API}${path}`, {
    headers: bbHeaders(opts),
    query,
    signal: opts?.signal
  })) as T
}

/** Bitbucket pagination is opaque-URL based (`next`), not page-number based — follow it directly. */
async function bbFetchPage<T>(url: string, opts?: ForgeReadOptions): Promise<BbPageResponse<T>> {
  return (await $fetch(url, {
    headers: bbHeaders(opts),
    signal: opts?.signal
  })) as BbPageResponse<T>
}

async function getRootTree(
  owner: string,
  repo: string,
  branch: string,
  opts?: ForgeReadOptions
): Promise<ForgeTreeEntry[]> {
  const data = await bbFetch<BbPageResponse<BbSrcEntryResponse>>(
    `/repositories/${owner}/${repo}/src/${encodeURIComponent(branch)}/`,
    { pagelen: 100 },
    opts
  )
  return (data.values ?? []).map(mapTreeEntry).sort(sortEntries)
}

async function getReadme(
  owner: string,
  repo: string,
  branch: string,
  entries: ForgeTreeEntry[],
  opts?: ForgeReadOptions
) {
  const readme = entries.find(
    (e) => e.type === 'file' && /^readme(\.(md|markdown|rst|txt|adoc))?$/i.test(e.name)
  )
  if (!readme) return null
  try {
    const content = await $fetch<string>(
      `${API}/repositories/${owner}/${repo}/src/${encodeURIComponent(branch)}/${encodePath(readme.path)}`,
      { headers: bbHeaders(opts), signal: opts?.signal, responseType: 'text' }
    )
    return { filename: readme.name, content: String(content ?? '') }
  } catch {
    return null
  }
}

export const bitbucketProvider: ForgeProvider = {
  id: 'bitbucket',
  label: 'Bitbucket',
  icon: 'i-simple-icons-bitbucket',
  color: '#0052cc',
  ownerLabel: 'Workspace',
  ownerPlaceholder: 'e.g. atlassian',
  repoPlaceholder: 'e.g. aui',
  capabilities: {
    code: true,
    issues: false,
    pulls: true,
    discussions: false,
    actions: false,
    repoSearch: false,
    issueSearch: false,
    codeSearch: false,
    userSearch: false,
    discussionSearch: false,
    star: false,
    mergeQueue: false,
    reactions: false
  },
  webUrl: (owner, repo) => `${WEB}/${owner}/${repo}`,
  ownerWebUrl: (owner) => `${WEB}/${owner}`,

  async getRepo(owner, repo, opts) {
    return mapRepo(await bbFetch<BbRepoResponse>(`/repositories/${owner}/${repo}`, undefined, opts))
  },

  async getOverview(owner, repo, opts) {
    const meta = await bitbucketProvider.getRepo!(owner, repo, opts)
    const entries = await getRootTree(owner, repo, meta.defaultBranch, opts).catch(
      () => [] as ForgeTreeEntry[]
    )
    const readme = await getReadme(owner, repo, meta.defaultBranch, entries, opts)
    return { repo: meta, entries, readme }
  },

  async listRepos(owner, opts) {
    const data = await bbFetch<BbPageResponse<BbRepoResponse>>(
      `/repositories/${owner}`,
      { pagelen: 60, sort: '-updated_on' },
      opts
    ).catch(() => ({ values: [] }) as BbPageResponse<BbRepoResponse>)
    return (data.values ?? []).map(mapRepo)
  },

  async listBranches(repo, opts) {
    const data = await bbFetch<BbPageResponse<BbBranchResponse>>(
      `/repositories/${repo.owner}/${repo.name}/refs/branches`,
      { pagelen: 100 },
      opts
    )
    return (data.values ?? []).map(
      (b): ForgeBranch => ({
        name: b.name ?? '',
        isDefault: b.name === repo.ref?.defaultBranch,
        commit: { sha: b.target?.hash }
      })
    )
  },

  async getTree(repo, ref, path, opts) {
    const data = await bbFetch<BbPageResponse<BbSrcEntryResponse>>(
      `/repositories/${repo.owner}/${repo.name}/src/${encodeURIComponent(ref)}/${encodePath(path)}`,
      { pagelen: 100 },
      opts
    )
    return (data.values ?? []).map(mapTreeEntry).sort(sortEntries)
  },

  async getBlob(repo, ref, path, opts) {
    const buf = await $fetch<ArrayBuffer>(
      `${API}/repositories/${repo.owner}/${repo.name}/src/${encodeURIComponent(ref)}/${encodePath(path)}`,
      { headers: bbHeaders(opts), signal: opts?.signal, responseType: 'arrayBuffer' }
    )
    const bytes = new Uint8Array(buf)
    const binary = bytes.subarray(0, 512).includes(0)
    if (binary) {
      let bin = ''
      const chunk = 0x8000
      for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
      }
      return {
        path,
        ref,
        content: btoa(bin),
        encoding: 'base64',
        isBinary: true,
        size: bytes.length
      } satisfies ForgeBlob
    }
    return {
      path,
      ref,
      content: new TextDecoder().decode(bytes),
      encoding: 'utf-8',
      isBinary: false,
      size: bytes.length
    } satisfies ForgeBlob
  },

  async listCommits(repo, ref, opts) {
    const limit = opts?.limit ?? 30
    const data = opts?.cursor
      ? await bbFetchPage<BbCommitResponse>(opts.cursor, opts)
      : await bbFetch<BbPageResponse<BbCommitResponse>>(
          `/repositories/${repo.owner}/${repo.name}/commits/${encodeURIComponent(ref)}`,
          { pagelen: limit },
          opts
        )
    return { items: (data.values ?? []).map(mapCommit), cursor: data.next }
  },

  async getCommit(repo, sha, opts) {
    const [commit, diffstat, diffText] = await Promise.all([
      bbFetch<BbCommitResponse>(
        `/repositories/${repo.owner}/${repo.name}/commit/${sha}`,
        undefined,
        opts
      ),
      bbFetch<BbPageResponse<BbDiffstatEntryResponse>>(
        `/repositories/${repo.owner}/${repo.name}/diffstat/${sha}`,
        { pagelen: 100 },
        opts
      ).catch(() => ({ values: [] }) as BbPageResponse<BbDiffstatEntryResponse>),
      $fetch<string>(`${API}/repositories/${repo.owner}/${repo.name}/diff/${sha}`, {
        headers: bbHeaders(opts),
        signal: opts?.signal,
        responseType: 'text'
      }).catch(() => '')
    ])
    const patches = splitUnifiedDiff(diffText)
    const entries = diffstat.values ?? []
    const files = entries.map((d) => {
      const mapped = mapDiffstat(d)
      mapped.patch = patches[mapped.path] ?? null
      return mapped
    })
    return {
      ...mapCommit(commit),
      stat: {
        additions: entries.reduce((sum, e) => sum + (e.lines_added ?? 0), 0),
        deletions: entries.reduce((sum, e) => sum + (e.lines_removed ?? 0), 0),
        filesChanged: entries.length
      },
      files
    } satisfies ForgeCommitDetail
  },

  async listPulls(repo, opts) {
    const limit = opts?.limit ?? 30
    const state =
      opts?.state === 'merged'
        ? 'MERGED'
        : opts?.state === 'closed'
          ? 'DECLINED'
          : opts?.state && opts.state !== 'all'
            ? 'OPEN'
            : undefined
    const data = await bbFetch<BbPageResponse<BbPrResponse>>(
      `/repositories/${repo.owner}/${repo.name}/pullrequests`,
      { pagelen: limit, state, sort: '-updated_on' },
      opts
    )
    return { items: (data.values ?? []).map(mapPull), cursor: data.next }
  },

  async getPull(repo, id, opts): Promise<ForgePullDetail> {
    const [pr, diffstat, commits] = await Promise.all([
      bbFetch<BbPrResponse>(
        `/repositories/${repo.owner}/${repo.name}/pullrequests/${id}`,
        undefined,
        opts
      ),
      bbFetch<BbPageResponse<BbDiffstatEntryResponse>>(
        `/repositories/${repo.owner}/${repo.name}/pullrequests/${id}/diffstat`,
        { pagelen: 100 },
        opts
      ).catch(() => ({ values: [] }) as BbPageResponse<BbDiffstatEntryResponse>),
      bbFetch<BbPageResponse<BbCommitResponse>>(
        `/repositories/${repo.owner}/${repo.name}/pullrequests/${id}/commits`,
        { pagelen: 100 },
        opts
      ).catch(() => ({ values: [] }) as BbPageResponse<BbCommitResponse>)
    ])
    const entries = diffstat.values ?? []
    const comments = await bbFetch<BbPageResponse<BbCommentResponse>>(
      `/repositories/${repo.owner}/${repo.name}/pullrequests/${id}/comments`,
      { pagelen: 100 },
      opts
    ).catch(() => ({ values: [] }) as BbPageResponse<BbCommentResponse>)
    return {
      ...mapPull(pr),
      stat: {
        additions: entries.reduce((sum, e) => sum + (e.lines_added ?? 0), 0),
        deletions: entries.reduce((sum, e) => sum + (e.lines_removed ?? 0), 0),
        filesChanged: entries.length
      },
      commitCount: (commits.values ?? []).length,
      comments: (comments.values ?? []).filter((c) => c.content?.raw).map(mapComment)
    }
  },

  async getPullFiles(repo, id, opts) {
    const data = await bbFetch<BbPageResponse<BbDiffstatEntryResponse>>(
      `/repositories/${repo.owner}/${repo.name}/pullrequests/${id}/diffstat`,
      { pagelen: 100 },
      opts
    )
    return (data.values ?? []).map(mapDiffstat)
  },

  async getPullCommits(repo, id, opts) {
    const data = await bbFetch<BbPageResponse<BbCommitResponse>>(
      `/repositories/${repo.owner}/${repo.name}/pullrequests/${id}/commits`,
      { pagelen: 100 },
      opts
    )
    return (data.values ?? []).map(mapCommit)
  },

  async createComment(repo, id, body, opts): Promise<ForgeComment> {
    const c = await $fetch<BbCommentResponse>(
      `${API}/repositories/${repo.owner}/${repo.name}/pullrequests/${id}/comments`,
      {
        method: 'POST',
        headers: bbHeaders(opts),
        body: { content: { raw: body } },
        signal: opts?.signal
      }
    )
    return mapComment(c)
  },

  // Bitbucket has no formal "request changes" review state (unlike GitHub/GitLab) —
  // an approval maps directly, anything else is posted as a plain comment.
  async createReview(repo, id, input, opts): Promise<void> {
    if (input.event === 'APPROVE') {
      await $fetch(`${API}/repositories/${repo.owner}/${repo.name}/pullrequests/${id}/approve`, {
        method: 'POST',
        headers: bbHeaders(opts),
        signal: opts?.signal
      })
    }
    if (input.body) {
      await $fetch(`${API}/repositories/${repo.owner}/${repo.name}/pullrequests/${id}/comments`, {
        method: 'POST',
        headers: bbHeaders(opts),
        body: { content: { raw: input.body } },
        signal: opts?.signal
      }).catch(() => {})
    }
  },

  async mergePull(repo, id, opts): Promise<ForgeMergeResult> {
    const strategy =
      opts?.method === 'squash'
        ? 'squash'
        : opts?.method === 'rebase'
          ? 'fast_forward'
          : 'merge_commit'
    try {
      await $fetch(`${API}/repositories/${repo.owner}/${repo.name}/pullrequests/${id}/merge`, {
        method: 'POST',
        headers: bbHeaders(opts),
        body: { merge_strategy: strategy },
        signal: opts?.signal
      })
      return { merged: true }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Merge failed.'
      return { merged: false, message }
    }
  },

  async listMyWork(opts): Promise<ForgeMyWork> {
    const empty: ForgeMyWork = { authoredPulls: [], reviewRequests: [], assignedIssues: [] }
    const token = opts?.token ?? getForgeToken('bitbucket')
    if (!token) return empty

    const me = await bbFetch<BbAccountResponse>(`/user`, undefined, { ...opts, token }).catch(
      () => null
    )
    if (!me) return empty
    const myId = me.uuid ?? me.account_id

    const workspaces = await bbFetch<BbPageResponse<BbWorkspaceResponse>>(
      `/workspaces`,
      { role: 'member', pagelen: 50 },
      { ...opts, token }
    ).catch(() => ({ values: [] }) as BbPageResponse<BbWorkspaceResponse>)

    const perWorkspace = await mapLimit(workspaces.values ?? [], 4, async (w) => {
      const slug = w.slug
      if (!slug || !myId) return [] as ForgePull[]
      return bbFetch<BbPageResponse<BbPrResponse>>(
        `/workspaces/${slug}/pullrequests/${encodeURIComponent(myId)}`,
        { pagelen: 20 },
        { ...opts, token }
      )
        .then((r) => (r.values ?? []).map(mapPull))
        .catch(() => [] as ForgePull[])
    })

    const authoredPulls: ForgePull[] = []
    const reviewRequests: ForgePull[] = []
    for (const pr of perWorkspace.flat()) {
      if (pr.state !== 'open') continue
      if (pr.author?.login && myId && pr.author.login === loginOf(me)) authoredPulls.push(pr)
      else reviewRequests.push(pr)
    }

    const toIssue = (p: ForgePull) => ({
      provider: p.provider,
      id: p.id,
      number: p.number,
      title: p.title,
      state: p.state === 'open' ? ('open' as const) : ('closed' as const),
      author: p.author,
      body: p.body,
      commentCount: p.commentCount,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      url: p.url,
      isPull: true,
      repo: p.repo
    })

    return {
      authoredPulls: authoredPulls.map(toIssue),
      reviewRequests: reviewRequests.map(toIssue),
      assignedIssues: []
    }
  }
}
