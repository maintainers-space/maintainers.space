import { resolveHandleToDid } from '~/lib/atproto/public'
import { noCacheHeaders } from '~/lib/reload-nav'
import type {
  ForgeActionJob,
  ForgeActionRun,
  ForgeBranch,
  ForgeBlob,
  ForgeCommit,
  ForgeCommitDetail,
  ForgeComment,
  ForgeContribution,
  ForgeFileDiff,
  ForgeId,
  ForgeInboxItem,
  ForgeIssue,
  ForgeIssueDetail,
  ForgeMyWork,
  ForgeNotification,
  ForgePull,
  ForgePullDetail,
  ForgePullState,
  ForgeProvider,
  ForgeReadOptions,
  ForgeRepo,
  ForgeRunStatus,
  ForgeTreeEntry,
  ForgeUser
} from '~/types/forge'

// Bobbin: Tangled's read-only XRPC aggregator (api.tangled.org) that accepts
// AT-URIs. It sends no CORS headers, so we reach it through our same-origin
// Nitro proxy (server/api/tangled/[...path].ts) instead of calling it directly.
const BOBBIN = '/api/tangled'

interface TangledRepoValue {
  $type?: string
  name?: string
  knot?: string
  spindle?: string
  repoDid?: string
  description?: string
  website?: string
  topics?: string[]
  source?: string
  createdAt?: string
}

interface TangledListItem {
  uri: string
  cid?: string
  value: TangledRepoValue
}

interface ResolvedRepo {
  atUri: string
  repoDid?: string
  knot?: string
  spindle?: string
  value: TangledRepoValue
}

interface TangledAuthorInfo {
  Name?: string
  Email?: string
  When?: string
}

// Commit records come back from two different Tangled endpoints with
// differently-cased fields (`sh.tangled.repo.log`/`diff` vs. the raw git
// plumbing used elsewhere), so both casings are optional here.
interface TangledCommitRecord {
  this?: string
  SHA?: string
  message?: string
  Message?: string
  author?: TangledAuthorInfo
  Author?: TangledAuthorInfo
  parent?: string
}

interface TangledDiffFileRecord {
  name?: { old?: string; new?: string }
  is_new?: boolean
  is_delete?: boolean
  is_rename?: boolean
  is_binary?: boolean
  text_fragments?: TangledFragment[]
}

interface TangledDiffResponse {
  commit?: TangledCommitRecord
  stat?: { insertions?: number; deletions?: number; files_changed?: number }
  diff?: TangledDiffFileRecord[]
}

interface TangledIssueValue {
  title?: string
  body?: string
  createdAt?: string
}

interface TangledIssueRecord {
  uri: string
  value?: TangledIssueValue
  state?: string
  commentCount?: number
  stateUpdatedAt?: string
}

interface TangledPullRef {
  branch?: string
  repoDid?: string
}

interface TangledPullValue {
  title?: string
  body?: string
  createdAt?: string
  source?: TangledPullRef
  target?: TangledPullRef
}

interface TangledPullRecord {
  uri: string
  value?: TangledPullValue
  state?: string
  status?: string
  commentCount?: number
  stateUpdatedAt?: string
}

// `sh.tangled.repo.compare` returns raw `git format-patch` entries (used for
// cross-branch, same-repo PR diffs), hence the PascalCase fields.
interface TangledFormatPatchFile {
  OldName?: string
  NewName?: string
  IsNew?: boolean
  IsDelete?: boolean
  IsRename?: boolean
  IsBinary?: boolean
  TextFragments?: TangledFragment[]
}

interface TangledFormatPatchEntry {
  SHA?: string
  Title?: string
  Body?: string
  Author?: { Name?: string; Email?: string }
  AuthorDate?: string
  Files?: TangledFormatPatchFile[]
}

interface TangledCommentValue {
  body?: string
  createdAt?: string
}

interface TangledCommentRecord {
  uri: string
  value?: TangledCommentValue
}

function rkeyFromUri(uri: string): string {
  return uri.split('/').pop() ?? ''
}

function didFromUri(uri: string): string {
  return uri.replace('at://', '').split('/')[0] ?? ''
}

// Git mode 0040000 == directory.
function isDirMode(mode: string): boolean {
  return typeof mode === 'string' && mode.startsWith('004')
}

function sortEntries(a: ForgeTreeEntry, b: ForgeTreeEntry): number {
  if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
  return a.name.localeCompare(b.name)
}

function tangledUser(did: string): ForgeUser {
  return { provider: 'tangled', login: did, ref: { did } }
}

async function bobbin<T>(
  nsid: string,
  query: Record<string, unknown>,
  opts?: ForgeReadOptions
): Promise<T> {
  return (await $fetch(`${BOBBIN}/${nsid}`, {
    query,
    signal: opts?.signal,
    headers: noCacheHeaders()
  })) as T
}

async function listRepoRecords(did: string, opts?: ForgeReadOptions): Promise<TangledListItem[]> {
  const data = await bobbin<{ items?: TangledListItem[] }>(
    'sh.tangled.repo.listRepos',
    { subject: did, limit: 100 },
    opts
  )
  return data.items ?? []
}

// Cache resolved repo records so detail pages don't re-list on every call.
const repoCache = new Map<string, Promise<ResolvedRepo>>()

async function resolveRepo(
  owner: string,
  repo: string,
  ref?: Record<string, unknown>,
  opts?: ForgeReadOptions
): Promise<ResolvedRepo> {
  if (ref?.atUri) {
    return {
      atUri: String(ref.atUri),
      repoDid: ref.repoDid as string | undefined,
      knot: ref.knot as string | undefined,
      spindle: ref.spindle as string | undefined,
      value: {}
    }
  }
  const key = `${owner}/${repo}`
  const hit = repoCache.get(key)
  if (hit) return hit
  const promise = (async () => {
    const did = await resolveHandleToDid(owner)
    const items = await listRepoRecords(did, opts)
    const match =
      items.find((it) => it.value?.name === repo) ??
      items.find((it) => rkeyFromUri(it.uri) === repo)
    if (!match) {
      throw createError({
        statusCode: 404,
        statusMessage: `Repository "${repo}" was not found on Tangled for ${owner}.`
      })
    }
    return {
      atUri: match.uri,
      repoDid: match.value?.repoDid,
      knot: match.value?.knot,
      spindle: match.value?.spindle,
      value: match.value ?? {}
    }
  })()
  repoCache.set(key, promise)
  promise.catch(() => repoCache.delete(key))
  return promise
}

async function getDefaultBranch(atUri: string, opts?: ForgeReadOptions): Promise<string> {
  try {
    const data = await bobbin<{ name?: string }>(
      'sh.tangled.repo.getDefaultBranch',
      { repo: atUri },
      opts
    )
    return data.name || 'main'
  } catch {
    return 'main'
  }
}

async function countStars(
  repoDid: string | undefined,
  opts?: ForgeReadOptions
): Promise<number | undefined> {
  if (!repoDid) return undefined
  try {
    const data = await bobbin<{ count?: number }>(
      'sh.tangled.feed.countStars',
      { subject: repoDid },
      opts
    )
    return data.count
  } catch {
    return undefined
  }
}

interface TangledTree {
  ref?: string
  readme?: { filename?: string; contents?: string } | null
  files?: Array<{
    name: string
    mode: string
    size?: number
    last_commit?: { message?: string; when?: string; hash?: string }
  }>
}

function mapTreeFiles(tree: TangledTree, basePath = ''): ForgeTreeEntry[] {
  return (tree.files ?? [])
    .map(
      (f): ForgeTreeEntry => ({
        name: f.name,
        path: basePath ? `${basePath}/${f.name}` : f.name,
        type: isDirMode(f.mode) ? 'dir' : 'file',
        size: f.size,
        lastCommit: f.last_commit
          ? { message: f.last_commit.message, when: f.last_commit.when, hash: f.last_commit.hash }
          : undefined
      })
    )
    .sort(sortEntries)
}

function makeRepo(
  owner: string,
  repo: string,
  resolved: ResolvedRepo,
  extra?: Partial<ForgeRepo>
): ForgeRepo {
  const value = resolved.value ?? {}
  const name = value.name || repo
  return {
    provider: 'tangled',
    owner,
    name,
    fullName: `${owner}/${name}`,
    description: value.description ?? null,
    defaultBranch: 'main',
    url: `https://tangled.org/${owner}/${repo}`,
    ownerUrl: `https://tangled.org/${owner}`,
    homepage: value.website ?? null,
    topics: value.topics ?? [],
    createdAt: value.createdAt ?? null,
    updatedAt: value.createdAt ?? null,
    ref: {
      atUri: resolved.atUri,
      ownerDid: resolved.atUri ? didFromUri(resolved.atUri) : undefined,
      knot: resolved.knot,
      repoDid: resolved.repoDid,
      spindle: resolved.spindle
    },
    ...extra
  }
}

interface TangledFragmentLine {
  Op: number
  Line: string
}
interface TangledFragment {
  OldPosition: number
  OldLines: number
  NewPosition: number
  NewLines: number
  Lines: TangledFragmentLine[]
}

function fragmentsToPatch(fragments: TangledFragment[]): string {
  let out = ''
  for (const frag of fragments ?? []) {
    out += `@@ -${frag.OldPosition},${frag.OldLines} +${frag.NewPosition},${frag.NewLines} @@\n`
    for (const ln of frag.Lines ?? []) {
      const prefix = ln.Op === 1 ? '+' : ln.Op === 2 ? '-' : ' '
      const text = ln.Line.endsWith('\n') ? ln.Line : `${ln.Line}\n`
      out += prefix + text
    }
  }
  return out
}

function countPatch(fragments: TangledFragment[]): { additions: number; deletions: number } {
  let additions = 0
  let deletions = 0
  for (const frag of fragments ?? []) {
    for (const ln of frag.Lines ?? []) {
      if (ln.Op === 1) additions++
      else if (ln.Op === 2) deletions++
    }
  }
  return { additions, deletions }
}

function ciStatus(s?: string): ForgeRunStatus {
  switch (s) {
    case 'success':
      return 'success'
    case 'failed':
      return 'failure'
    case 'cancelled':
      return 'cancelled'
    case 'timeout':
      return 'timed_out'
    case 'running':
      return 'running'
    case 'pending':
      return 'pending'
    default:
      return 'unknown'
  }
}

function rollupStatus(workflows: Array<{ status?: string }>): ForgeRunStatus {
  const statuses = workflows.map((w) => ciStatus(w.status))
  if (statuses.some((s) => s === 'failure')) return 'failure'
  if (statuses.some((s) => s === 'running' || s === 'pending' || s === 'queued')) return 'running'
  if (statuses.some((s) => s === 'timed_out')) return 'timed_out'
  if (statuses.some((s) => s === 'cancelled')) return 'cancelled'
  if (statuses.length && statuses.every((s) => s === 'success')) return 'success'
  return 'unknown'
}

interface TangledPipeline {
  id: string
  repo?: string
  commit?: string
  createdAt?: string
  trigger?: { ref?: string }
  workflows?: Array<{
    id?: string
    name?: string
    status?: string
    startedAt?: string
    finishedAt?: string
    error?: string
  }>
}

function mapPipeline(p: TangledPipeline): ForgeActionRun {
  const branch = p.trigger?.ref?.replace('refs/heads/', '') ?? null
  return {
    provider: 'tangled',
    id: p.id,
    name: (p.workflows ?? [])[0]?.name || `Pipeline ${p.id.slice(0, 8)}`,
    status: rollupStatus(p.workflows ?? []),
    branch,
    commitSha: p.commit ?? null,
    createdAt: p.createdAt ?? null,
    jobs: (p.workflows ?? []).map(
      (w): ForgeActionJob => ({
        id: w.id || w.name || '',
        name: w.name || w.id || 'workflow',
        status: ciStatus(w.status),
        startedAt: w.startedAt ?? null,
        completedAt: w.finishedAt ?? null,
        error: w.error ?? null
      })
    )
  }
}

export const tangledProvider: ForgeProvider = {
  id: 'tangled',
  label: 'Tangled',
  icon: 'i-koinon-tangled',
  color: '#4f46e5',
  ownerLabel: 'Handle',
  ownerPlaceholder: 'e.g. tangled.org',
  repoPlaceholder: 'e.g. core',
  capabilities: {
    code: true,
    issues: true,
    pulls: true,
    discussions: false,
    actions: true,
    repoSearch: false,
    issueSearch: false,
    codeSearch: false,
    userSearch: false,
    discussionSearch: false,
    star: true,
    mergeQueue: false,
    reactions: false
  },
  webUrl: (owner, repo) => `https://tangled.org/${owner}/${repo}`,
  ownerWebUrl: (owner) => `https://tangled.org/${owner}`,

  async getRepo(owner, repo, opts) {
    const resolved = await resolveRepo(owner, repo, undefined, opts)
    const [branch, stars] = await Promise.all([
      getDefaultBranch(resolved.atUri, opts),
      countStars(resolved.repoDid, opts)
    ])
    return makeRepo(owner, repo, resolved, { defaultBranch: branch, stars })
  },

  async getOverview(owner, repo, opts) {
    const resolved = await resolveRepo(owner, repo, undefined, opts)
    const branch = await getDefaultBranch(resolved.atUri, opts)
    const [tree, stars] = await Promise.all([
      bobbin<TangledTree>('sh.tangled.repo.tree', { repo: resolved.atUri, ref: branch }, opts),
      countStars(resolved.repoDid, opts)
    ])
    const entries = mapTreeFiles(tree)
    const forgeRepo = makeRepo(owner, repo, resolved, { defaultBranch: tree.ref || branch, stars })
    const readme = tree.readme?.contents
      ? { filename: tree.readme.filename || 'README', content: tree.readme.contents }
      : null
    return { repo: forgeRepo, entries, readme }
  },

  async listRepos(owner, opts) {
    const did = await resolveHandleToDid(owner)
    const items = await listRepoRecords(did, opts)
    return items.map((it): ForgeRepo => {
      const value = it.value ?? {}
      const name = value.name || rkeyFromUri(it.uri)
      return {
        provider: 'tangled',
        owner,
        name,
        fullName: `${owner}/${name}`,
        description: value.description ?? null,
        defaultBranch: 'main',
        url: `https://tangled.org/${owner}/${name}`,
        ownerUrl: `https://tangled.org/${owner}`,
        homepage: value.website ?? null,
        topics: value.topics ?? [],
        createdAt: value.createdAt ?? null,
        updatedAt: value.createdAt ?? null,
        ref: { atUri: it.uri, knot: value.knot, repoDid: value.repoDid, spindle: value.spindle }
      }
    })
  },

  async listBranches(repo, opts): Promise<ForgeBranch[]> {
    const resolved = await resolveRepo(repo.owner, repo.name, repo.ref, opts)
    try {
      const data = await bobbin<{
        branches?: Array<{ reference?: { name?: string; hash?: string }; is_default?: boolean }>
      }>('sh.tangled.repo.branches', { repo: resolved.atUri }, opts)
      return (data.branches ?? [])
        .map(
          (b): ForgeBranch => ({
            name: b.reference?.name || '',
            isDefault: b.is_default,
            commit: { sha: b.reference?.hash }
          })
        )
        .filter((b) => b.name)
    } catch {
      return []
    }
  },

  async getTree(repo, ref, path, opts) {
    const resolved = await resolveRepo(repo.owner, repo.name, repo.ref, opts)
    const tree = await bobbin<TangledTree>(
      'sh.tangled.repo.tree',
      { repo: resolved.atUri, ref, path },
      opts
    )
    return mapTreeFiles(tree, path)
  },

  async getBlob(repo, ref, path, opts): Promise<ForgeBlob> {
    const resolved = await resolveRepo(repo.owner, repo.name, repo.ref, opts)
    const data = await bobbin<{
      content?: string
      encoding?: string
      isBinary?: boolean
      mimeType?: string
      size?: number
      path?: string
    }>('sh.tangled.repo.blob', { repo: resolved.atUri, ref, path, raw: false }, opts)
    const isBinary = !!data.isBinary || data.encoding === 'base64'
    return {
      path: data.path || path,
      ref,
      content: data.content ?? '',
      encoding: data.encoding === 'base64' ? 'base64' : 'utf-8',
      isBinary,
      size: data.size,
      mimeType: data.mimeType ?? null
    }
  },

  async listCommits(repo, ref, opts) {
    const resolved = await resolveRepo(repo.owner, repo.name, repo.ref, opts)
    const limit = opts?.limit ?? 30
    const data = await bobbin<{ commits?: TangledCommitRecord[]; total?: number }>(
      'sh.tangled.repo.log',
      { repo: resolved.atUri, ref, limit, cursor: opts?.cursor },
      opts
    )
    const commits = (data.commits ?? []).map(mapTangledCommit)
    const last = commits[commits.length - 1]
    return {
      items: commits,
      total: data.total,
      cursor: commits.length === limit && last ? last.sha : undefined
    }
  },

  async getCommit(repo, sha, opts): Promise<ForgeCommitDetail> {
    const resolved = await resolveRepo(repo.owner, repo.name, repo.ref, opts)
    const data = await bobbin<{ diff?: TangledDiffResponse }>(
      'sh.tangled.repo.diff',
      { repo: resolved.atUri, ref: sha },
      opts
    )
    const commit = mapTangledCommit(data.diff?.commit ?? { this: sha })
    const files: ForgeFileDiff[] = (data.diff?.diff ?? []).map((f): ForgeFileDiff => {
      const counts = countPatch(f.text_fragments ?? [])
      return {
        oldPath: f.name?.old,
        path: f.name?.new || f.name?.old || '',
        status: f.is_new ? 'added' : f.is_delete ? 'removed' : f.is_rename ? 'renamed' : 'modified',
        additions: counts.additions,
        deletions: counts.deletions,
        isBinary: f.is_binary,
        patch: f.is_binary ? null : fragmentsToPatch(f.text_fragments ?? [])
      }
    })
    return {
      ...commit,
      stat: {
        additions: data.diff?.stat?.insertions,
        deletions: data.diff?.stat?.deletions,
        filesChanged: data.diff?.stat?.files_changed
      },
      files
    }
  },

  async listIssues(repo, opts) {
    const resolved = await resolveRepo(repo.owner, repo.name, repo.ref, opts)
    if (!resolved.repoDid) return { items: [] }
    const query: Record<string, unknown> = {
      subject: resolved.repoDid,
      limit: opts?.limit ?? 50,
      cursor: opts?.cursor
    }
    if (opts?.state && opts.state !== 'all') query.state = opts.state
    const data = await bobbin<{ items?: TangledIssueRecord[]; cursor?: string }>(
      'sh.tangled.repo.listIssues',
      query,
      opts
    )
    return { items: (data.items ?? []).map(mapTangledIssue), cursor: data.cursor }
  },

  async getIssue(repo, id, opts): Promise<ForgeIssueDetail> {
    const resolved = await resolveRepo(repo.owner, repo.name, repo.ref, opts)
    const list = await bobbin<{ items?: TangledIssueRecord[] }>(
      'sh.tangled.repo.listIssues',
      { subject: resolved.repoDid, limit: 200 },
      opts
    )
    const match = (list.items ?? []).find((it) => rkeyFromUri(it.uri) === id)
    if (!match) throw createError({ statusCode: 404, statusMessage: `Issue "${id}" not found.` })
    const comments = await listTangledComments(match.uri, opts)
    return { ...mapTangledIssue(match), comments }
  },

  async listPulls(repo, opts) {
    const resolved = await resolveRepo(repo.owner, repo.name, repo.ref, opts)
    if (!resolved.repoDid) return { items: [] }
    const query: Record<string, unknown> = {
      subject: resolved.repoDid,
      limit: opts?.limit ?? 50,
      cursor: opts?.cursor
    }
    if (opts?.state && opts.state !== 'all') query.status = opts.state
    const data = await bobbin<{ items?: TangledPullRecord[]; cursor?: string }>(
      'sh.tangled.repo.listPulls',
      query,
      opts
    )
    let items = (data.items ?? []).map(mapTangledPull)
    // "Closed" means closed-not-merged; never surface merged PRs under it.
    if (opts?.state === 'closed') items = items.filter((p) => p.state === 'closed')
    return { items, cursor: data.cursor }
  },

  async getPull(repo, id, opts): Promise<ForgePullDetail> {
    const resolved = await resolveRepo(repo.owner, repo.name, repo.ref, opts)
    const list = await bobbin<{ items?: TangledPullRecord[] }>(
      'sh.tangled.repo.listPulls',
      { subject: resolved.repoDid, limit: 200 },
      opts
    )
    const match = (list.items ?? []).find((it) => rkeyFromUri(it.uri) === id)
    if (!match)
      throw createError({ statusCode: 404, statusMessage: `Pull request "${id}" not found.` })
    const comments = await listTangledComments(match.uri, opts)
    return { ...mapTangledPull(match), comments }
  },

  async getPullFiles(repo, id, opts): Promise<ForgeFileDiff[]> {
    const resolved = await resolveRepo(repo.owner, repo.name, repo.ref, opts)
    const list = await bobbin<{ items?: TangledPullRecord[] }>(
      'sh.tangled.repo.listPulls',
      { subject: resolved.repoDid, limit: 200 },
      opts
    )
    const match = (list.items ?? []).find((it) => rkeyFromUri(it.uri) === id)
    const src = match?.value?.source
    const tgt = match?.value?.target
    // Cross-repo (fork) PR patches live as gzipped blobs; only same-repo diffs are cheaply comparable.
    if (!src || !tgt || src.repoDid !== tgt.repoDid) return []
    try {
      const data = await bobbin<{ format_patch?: TangledFormatPatchEntry[] }>(
        'sh.tangled.repo.compare',
        { repo: resolved.atUri, rev1: tgt.branch, rev2: src.branch },
        opts
      )
      const files: ForgeFileDiff[] = []
      for (const fp of data.format_patch ?? []) {
        for (const f of fp.Files ?? []) {
          const counts = countPatch(f.TextFragments ?? [])
          files.push({
            oldPath: f.OldName,
            path: f.NewName || f.OldName || '',
            status: f.IsNew
              ? 'added'
              : f.IsDelete
                ? 'removed'
                : f.IsRename
                  ? 'renamed'
                  : 'modified',
            additions: counts.additions,
            deletions: counts.deletions,
            isBinary: f.IsBinary,
            patch: f.IsBinary ? null : fragmentsToPatch(f.TextFragments ?? [])
          })
        }
      }
      return files
    } catch {
      return []
    }
  },

  async getPullCommits(repo, id, opts): Promise<ForgeCommit[]> {
    const resolved = await resolveRepo(repo.owner, repo.name, repo.ref, opts)
    const list = await bobbin<{ items?: TangledPullRecord[] }>(
      'sh.tangled.repo.listPulls',
      { subject: resolved.repoDid, limit: 200 },
      opts
    )
    const match = (list.items ?? []).find((it) => rkeyFromUri(it.uri) === id)
    const src = match?.value?.source
    const tgt = match?.value?.target
    if (!src || !tgt || src.repoDid !== tgt.repoDid) return []
    try {
      const data = await bobbin<{ format_patch?: TangledFormatPatchEntry[] }>(
        'sh.tangled.repo.compare',
        { repo: resolved.atUri, rev1: tgt.branch, rev2: src.branch },
        opts
      )
      return (data.format_patch ?? []).map(
        (fp): ForgeCommit => ({
          sha: fp.SHA ?? '',
          shortSha: fp.SHA ? String(fp.SHA).slice(0, 7) : '',
          message: [fp.Title, fp.Body].filter(Boolean).join('\n\n'),
          author: { name: fp.Author?.Name, email: fp.Author?.Email, when: fp.AuthorDate }
        })
      )
    } catch {
      return []
    }
  },

  async listActionRuns(repo, opts) {
    const resolved = await resolveRepo(repo.owner, repo.name, repo.ref, opts)
    if (!resolved.spindle || !resolved.repoDid) return { items: [] }
    try {
      const data = await $fetch<{ pipelines?: TangledPipeline[]; cursor?: string; total?: number }>(
        `https://${resolved.spindle}/xrpc/sh.tangled.ci.queryPipelines`,
        {
          query: { repo: resolved.repoDid, limit: opts?.limit ?? 50, cursor: opts?.cursor },
          signal: opts?.signal
        }
      )
      return {
        items: (data.pipelines ?? []).map(mapPipeline),
        cursor: data.cursor,
        total: data.total
      }
    } catch {
      return { items: [] }
    }
  },

  async getActionRun(repo, id, opts): Promise<ForgeActionRun> {
    const resolved = await resolveRepo(repo.owner, repo.name, repo.ref, opts)
    if (!resolved.spindle)
      throw createError({ statusCode: 404, statusMessage: 'No CI configured for this repo.' })
    const data = await $fetch<TangledPipeline>(
      `https://${resolved.spindle}/xrpc/sh.tangled.ci.getPipeline`,
      { query: { pipeline: id }, signal: opts?.signal }
    )
    return mapPipeline(data)
  },

  // Tangled has no anonymous notification inbox, so as a best-effort we surface
  // recent issue, PR and CI activity on the viewer's own repos instead.
  async listNotifications(opts): Promise<ForgeNotification[]> {
    const items = await collectTangledInbox(opts)
    return items.map(
      (it): ForgeNotification => ({
        provider: 'tangled',
        id: it.id,
        kind: it.kind,
        title: it.title,
        reason: it.reason,
        unread: it.unread,
        updatedAt: it.updatedAt,
        repo: it.repo,
        to: it.to,
        url: it.url
      })
    )
  },

  async listInbox(opts): Promise<ForgeInboxItem[]> {
    return collectTangledInbox(opts)
  },

  // Best-effort activity feed: the repos a Tangled identity has created, since
  // there is no public per-user event endpoint.
  async listUserEvents(login, opts): Promise<ForgeContribution[]> {
    let did: string
    try {
      did = await resolveHandleToDid(login)
    } catch {
      return []
    }
    const handle = login.startsWith('did:') ? did : login.trim().replace(/^@/, '')
    let records: TangledListItem[]
    try {
      records = await listRepoRecords(did, opts)
    } catch {
      return []
    }
    return records
      .map((rec): ForgeContribution | null => {
        const value = rec.value ?? {}
        const name = value.name || rkeyFromUri(rec.uri)
        const createdAt = value.createdAt
        if (!createdAt) return null
        return {
          provider: 'tangled',
          id: `repo:${rec.uri}`,
          kind: 'create',
          actor: { provider: 'tangled', login: handle, ref: { did } },
          repo: {
            owner: handle,
            name,
            fullName: `${handle}/${name}`,
            url: `https://tangled.org/${handle}/${name}`
          },
          title: name,
          url: `/tangled/${handle}/${name}`,
          createdAt,
          refType: 'repository',
          impact: 3
        }
      })
      .filter((c): c is ForgeContribution => !!c)
  },

  /**
   * Tangled has no "assigned to me" or "review requested" concept, and pulls can
   * only be listed per-target-repo (no cross-network "PRs I authored" query), so
   * this approximates a maintainer's todo list from the repos the viewer owns:
   * open pulls they authored themselves, open pulls from others awaiting their
   * merge/review, and open issues on their own repos.
   */
  async listMyWork(opts): Promise<ForgeMyWork> {
    const empty: ForgeMyWork = { authoredPulls: [], reviewRequests: [], assignedIssues: [] }
    const viewer = opts?.viewer
    if (!viewer) return empty
    let did: string
    try {
      did = await resolveHandleToDid(viewer)
    } catch {
      return empty
    }
    const ownerHandle = viewer.startsWith('did:') ? did : viewer.trim().replace(/^@/, '')

    let records: TangledListItem[]
    try {
      records = await listRepoRecords(did, opts)
    } catch {
      return empty
    }

    const authoredPulls: ForgeIssue[] = []
    const reviewRequests: ForgeIssue[] = []
    const assignedIssues: ForgeIssue[] = []

    await Promise.all(
      records.slice(0, 10).map(async (rec) => {
        const repoDid = rec.value?.repoDid
        const name = rec.value?.name || rkeyFromUri(rec.uri)
        if (!repoDid) return
        const repo = {
          provider: 'tangled' as ForgeId,
          owner: ownerHandle,
          name,
          fullName: `${ownerHandle}/${name}`
        }
        const base = `/tangled/${ownerHandle}/${name}`

        const [issues, pulls] = await Promise.all([
          bobbin<{ items?: TangledIssueRecord[] }>(
            'sh.tangled.repo.listIssues',
            { subject: repoDid, state: 'open', limit: 20 },
            opts
          ).catch(() => ({ items: [] as TangledIssueRecord[] })),
          bobbin<{ items?: TangledPullRecord[] }>(
            'sh.tangled.repo.listPulls',
            { subject: repoDid, status: 'open', limit: 20 },
            opts
          ).catch(() => ({ items: [] as TangledPullRecord[] }))
        ])

        for (const it of issues.items ?? []) {
          const m = mapTangledIssue(it)
          if (m.state !== 'open') continue
          assignedIssues.push({
            ...m,
            isPull: false,
            repo,
            url: `https://tangled.org${base}/issues/${m.id}`
          })
        }
        for (const it of pulls.items ?? []) {
          const m = mapTangledPull(it)
          if (m.state !== 'open') continue
          const item = pullAsWorkItem(m, repo, `https://tangled.org${base}/pulls/${m.id}`)
          if (m.author?.login === did) authoredPulls.push(item)
          else reviewRequests.push(item)
        }
      })
    )

    return { authoredPulls, reviewRequests, assignedIssues }
  }
}

/** A Tangled pull, reshaped into `ForgeIssue` for the home dashboard's "my work" feed. */
function pullAsWorkItem(
  p: ForgePull,
  repo: { provider: ForgeId; owner: string; name: string; fullName: string },
  url: string
): ForgeIssue {
  return {
    provider: 'tangled',
    id: p.id,
    title: p.title,
    state: p.state === 'open' ? 'open' : 'closed',
    author: p.author,
    body: p.body,
    commentCount: p.commentCount,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    url,
    isPull: true,
    repo
  }
}

/**
 * Build Tangled's inbox: recent issues, pull requests and — importantly —
 * failing CI pipelines on the viewer's own repos, each as an actionable,
 * completable {@link ForgeInboxItem}. Resolved (closed/merged) subjects are kept
 * but tagged so the inbox can file them under "recently resolved".
 */
async function collectTangledInbox(opts?: ForgeReadOptions): Promise<ForgeInboxItem[]> {
  const viewer = opts?.viewer
  if (!viewer) return []
  let did: string
  try {
    did = await resolveHandleToDid(viewer)
  } catch {
    return []
  }
  const ownerHandle = viewer.startsWith('did:') ? did : viewer.trim().replace(/^@/, '')

  let records: TangledListItem[]
  try {
    records = await listRepoRecords(did, opts)
  } catch {
    return []
  }

  const cutoff = Date.now() - 30 * 86_400_000
  const recent = (ts?: string | null): boolean => !!ts && new Date(ts).getTime() >= cutoff

  const perRepo = await Promise.all(
    records.slice(0, 10).map(async (rec): Promise<ForgeInboxItem[]> => {
      const repoDid = rec.value?.repoDid
      const spindle = rec.value?.spindle
      const name = rec.value?.name || rkeyFromUri(rec.uri)
      if (!repoDid) return []
      const base = `/tangled/${ownerHandle}/${name}`
      const repoRef = { owner: ownerHandle, name, fullName: `${ownerHandle}/${name}` }

      const [issues, pulls, pipelines] = await Promise.all([
        bobbin<{ items?: TangledIssueRecord[] }>(
          'sh.tangled.repo.listIssues',
          { subject: repoDid, limit: 12 },
          opts
        ).catch(() => ({ items: [] as TangledIssueRecord[] })),
        bobbin<{ items?: TangledPullRecord[] }>(
          'sh.tangled.repo.listPulls',
          { subject: repoDid, limit: 12 },
          opts
        ).catch(() => ({ items: [] as TangledPullRecord[] })),
        spindle
          ? $fetch<{ pipelines?: TangledPipeline[] }>(
              `https://${spindle}/xrpc/sh.tangled.ci.queryPipelines`,
              { query: { repo: repoDid, limit: 20 }, signal: opts?.signal }
            ).catch(() => ({ pipelines: [] as TangledPipeline[] }))
          : Promise.resolve({ pipelines: [] as TangledPipeline[] })
      ])

      const out: ForgeInboxItem[] = []
      for (const it of issues.items ?? []) {
        const m = mapTangledIssue(it)
        const updated = m.updatedAt ?? m.createdAt
        if (!recent(updated)) continue
        const resolved = m.state === 'closed'
        out.push({
          provider: 'tangled',
          id: `issue:${name}:${m.id}`,
          kind: 'issue',
          title: m.title,
          reason: resolved ? 'closed issue' : 'issue',
          unread: false,
          updatedAt: updated,
          repo: repoRef,
          to: `${base}/issues/${m.id}`,
          url: `https://tangled.org${base}/issues/${m.id}`,
          state: resolved ? 'closed' : 'open',
          resolved,
          author: m.author
        })
      }
      for (const it of pulls.items ?? []) {
        const m = mapTangledPull(it)
        const updated = m.updatedAt ?? m.createdAt
        if (!recent(updated)) continue
        const resolved = m.state === 'closed' || m.state === 'merged'
        out.push({
          provider: 'tangled',
          id: `pull:${name}:${m.id}`,
          kind: 'pull',
          title: m.title,
          reason: `${m.state} pull request`,
          unread: false,
          updatedAt: updated,
          repo: repoRef,
          to: `${base}/pulls/${m.id}`,
          url: `https://tangled.org${base}/pulls/${m.id}`,
          state: m.state,
          resolved,
          author: m.author
        })
      }
      for (const p of pipelines.pipelines ?? []) {
        const run = mapPipeline(p)
        if (run.status !== 'failure' && run.status !== 'timed_out') continue
        if (!recent(run.createdAt)) continue
        out.push({
          provider: 'tangled',
          id: `ci:${name}:${run.id}`,
          kind: 'ci',
          title: `CI failed${run.branch ? ` on ${run.branch}` : ''} · ${name}`,
          reason: 'pipeline failed',
          unread: false,
          updatedAt: run.createdAt,
          repo: repoRef,
          to: `${base}/actions`,
          url: `https://tangled.org${base}/actions`,
          resolved: false
        })
      }
      return out
    })
  )
  return perRepo.flat()
}

function mapTangledCommit(c: TangledCommitRecord): ForgeCommit {
  const sha: string = c.this || c.SHA || ''
  return {
    sha,
    shortSha: sha ? sha.slice(0, 7) : '',
    message: c.message || c.Message || '',
    author:
      c.author || c.Author
        ? {
            name: c.author?.Name ?? c.Author?.Name,
            email: c.author?.Email ?? c.Author?.Email,
            when: c.author?.When ?? c.Author?.When
          }
        : undefined,
    parents: c.parent ? [c.parent] : undefined
  }
}

function mapTangledIssue(it: TangledIssueRecord): ForgeIssue {
  const value = it.value ?? {}
  return {
    provider: 'tangled',
    id: rkeyFromUri(it.uri),
    title: value.title ?? '(untitled)',
    state: it.state === 'closed' ? 'closed' : 'open',
    author: tangledUser(didFromUri(it.uri)),
    body: value.body ?? null,
    commentCount: it.commentCount,
    createdAt: value.createdAt ?? null,
    updatedAt: it.stateUpdatedAt ?? value.createdAt ?? null,
    ref: { atUri: it.uri }
  }
}

function tangledPullState(it: TangledPullRecord): ForgePullState {
  const s = it.state ?? it.status
  if (s === 'merged') return 'merged'
  if (s === 'closed') return 'closed'
  return 'open'
}

function mapTangledPull(it: TangledPullRecord): ForgePull {
  const value = it.value ?? {}
  return {
    provider: 'tangled',
    id: rkeyFromUri(it.uri),
    title: value.title ?? '(untitled)',
    state: tangledPullState(it),
    author: tangledUser(didFromUri(it.uri)),
    body: value.body ?? null,
    commentCount: it.commentCount,
    sourceBranch: value.source?.branch,
    targetBranch: value.target?.branch,
    createdAt: value.createdAt ?? null,
    updatedAt: it.stateUpdatedAt ?? value.createdAt ?? null,
    ref: { atUri: it.uri }
  }
}

async function listTangledComments(
  subjectAtUri: string,
  opts?: ForgeReadOptions
): Promise<ForgeComment[]> {
  try {
    const data = await bobbin<{ items?: TangledCommentRecord[] }>(
      'sh.tangled.feed.listComments',
      { subject: subjectAtUri, limit: 100, order: 'asc' },
      opts
    )
    return (data.items ?? []).map(
      (c): ForgeComment => ({
        id: rkeyFromUri(c.uri),
        author: tangledUser(didFromUri(c.uri)),
        body: c.value?.body ?? '',
        createdAt: c.value?.createdAt ?? null
      })
    )
  } catch {
    return []
  }
}
