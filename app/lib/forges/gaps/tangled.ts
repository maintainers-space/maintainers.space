// GAP(forges): the Tangled provider reads issues, pulls and comments, but has no contents or CI
// API, cannot resolve a handle or a repo name (it wants a DID and a TID rkey), and reports no
// default branch. This module covers those through Bobbin and the knot via `provider.request()`.
import type {
  Branch,
  ChangedFile,
  CiJob,
  CiRun,
  CheckState,
  Commit,
  FileContent,
  ForgeProvider,
  Repo,
  RepoRef,
  TreeEntry
} from 'forges'

import { resolveHandleToDid } from '~/lib/atproto/public'

interface RepoRecord {
  description?: string
  knot?: string
  name?: string
  repoDid?: string
  spindle?: string
  topics?: string[]
  website?: string
  createdAt?: string
}

export interface TangledRepoRaw {
  atUri: string
  defaultBranch: string
  handle: string
  knot?: string
  record: RepoRecord
  spindle?: string
  stars?: number
}

const NAME_CACHE = new Map<string, Promise<Repo>>()

function bobbin<T>(provider: ForgeProvider, nsid: string, query: Record<string, unknown>) {
  return provider
    .request<T>('GET', `xrpc/${nsid}`, { query: query as Record<string, string> })
    .then((r) => r.data)
}

/** Resolves `/tangled/:handle/:name` to a package `Repo` (owner = DID, name = rkey). */
export function resolveTangledRepo(
  provider: ForgeProvider,
  handle: string,
  name: string
): Promise<Repo> {
  const key = `${handle}/${name}`
  let hit = NAME_CACHE.get(key)
  if (!hit) {
    hit = load(provider, handle, name)
    NAME_CACHE.set(key, hit)
    hit.catch(() => NAME_CACHE.delete(key))
  }
  return hit
}

async function load(provider: ForgeProvider, handle: string, name: string): Promise<Repo> {
  const did = handle.startsWith('did:') ? handle : await resolveHandleToDid(handle)
  const list = await bobbin<{ items?: Array<{ uri: string; value: RepoRecord }> }>(
    provider,
    'sh.tangled.repo.listRepos',
    { subject: did, limit: 100 }
  )
  const match =
    list.items?.find((it) => it.value?.name === name) ??
    list.items?.find((it) => it.uri.endsWith(`/${name}`))
  if (!match)
    throw createError({
      statusCode: 404,
      statusMessage: `Repository "${name}" was not found on Tangled for ${handle}.`
    })
  return toRepo(provider, handle, did, match)
}

/** Every repo a Tangled account owns. */
export async function listTangledRepos(provider: ForgeProvider, handle: string): Promise<Repo[]> {
  const did = handle.startsWith('did:') ? handle : await resolveHandleToDid(handle)
  const list = await bobbin<{ items?: Array<{ uri: string; value: RepoRecord }> }>(
    provider,
    'sh.tangled.repo.listRepos',
    { subject: did, limit: 100 }
  )
  return Promise.all((list.items ?? []).map((it) => toRepo(provider, handle, did, it, 'main')))
}

async function toRepo(
  provider: ForgeProvider,
  handle: string,
  did: string,
  item: { uri: string; value: RepoRecord },
  knownBranch?: string
): Promise<Repo> {
  const record = item.value
  const rkey = item.uri.split('/').pop() ?? ''
  const [defaultBranch, stars] = await Promise.all([
    knownBranch ??
      bobbin<{ name?: string }>(provider, 'sh.tangled.repo.getDefaultBranch', { repo: item.uri })
        .then((d) => d.name || 'main')
        .catch(() => 'main'),
    record.repoDid
      ? bobbin<{ count?: number }>(provider, 'sh.tangled.feed.countStars', {
          subject: record.repoDid
        })
          .then((d) => d.count)
          .catch(() => undefined)
      : undefined
  ])
  const raw: TangledRepoRaw = {
    atUri: item.uri,
    defaultBranch,
    handle,
    knot: record.knot,
    record,
    spindle: record.spindle,
    stars
  }
  return {
    ref: {
      forge: 'tangled',
      instance: provider.instance,
      owner: did,
      name: rkey,
      externalId: record.repoDid
    },
    description: record.description,
    defaultBranch,
    visibility: 'public',
    isFork: false,
    isArchived: false,
    topics: record.topics ?? [],
    url: `https://tangled.org/${handle}/${record.name ?? rkey}`,
    createdAt: record.createdAt ? new Date(record.createdAt) : undefined,
    raw
  }
}

function atUriOf(repo: RepoRef): string {
  return `at://${repo.owner}/sh.tangled.repo/${repo.name}`
}

export async function getTangledTree(
  provider: ForgeProvider,
  repo: RepoRef,
  ref: string,
  path = ''
): Promise<TreeEntry[]> {
  const tree = await bobbin<{ files?: Array<{ name: string; mode: string; size?: number }> }>(
    provider,
    'sh.tangled.repo.tree',
    { path, ref, repo: atUriOf(repo) }
  )
  return (tree.files ?? []).map((f) => ({
    mode: f.mode,
    path: path ? `${path}/${f.name}` : f.name,
    size: f.size,
    type: f.mode.startsWith('004') ? ('directory' as const) : ('file' as const)
  }))
}

export async function getTangledFile(
  provider: ForgeProvider,
  repo: RepoRef,
  ref: string,
  path: string
): Promise<FileContent> {
  const data = await bobbin<{
    content?: string
    encoding?: string
    isBinary?: boolean
    size?: number
  }>(provider, 'sh.tangled.repo.blob', { path, raw: false, ref, repo: atUriOf(repo) })
  const content = data.content ?? ''
  if (data.isBinary || data.encoding === 'base64') {
    return {
      content: Uint8Array.from(atob(content), (c) => c.charCodeAt(0)),
      encoding: 'binary',
      path,
      size: data.size
    }
  }
  return { content, encoding: 'utf-8', path, size: data.size }
}

export async function getTangledBranches(
  provider: ForgeProvider,
  repo: RepoRef
): Promise<Branch[]> {
  const data = await bobbin<{
    branches?: Array<{ reference?: { name?: string; hash?: string }; is_default?: boolean }>
  }>(provider, 'sh.tangled.repo.branches', { repo: atUriOf(repo) })
  return (data.branches ?? []).flatMap((b) =>
    b.reference?.name
      ? [{ isDefault: b.is_default, name: b.reference.name, raw: b, sha: b.reference.hash ?? '' }]
      : []
  )
}

interface CommitRecord {
  this?: string
  SHA?: string
  message?: string
  Message?: string
  author?: { Name?: string; Email?: string; When?: string }
  Author?: { Name?: string; Email?: string; When?: string }
  parent?: string
}

function toCommit(repo: RepoRef, c: CommitRecord): Commit {
  const sha = c.this || c.SHA || ''
  const author = c.author ?? c.Author
  return {
    author: author
      ? {
          date: author.When ? new Date(author.When) : undefined,
          email: author.Email,
          name: author.Name
        }
      : undefined,
    message: c.message || c.Message || '',
    parents: c.parent ? [c.parent] : [],
    raw: c,
    ref: { forge: 'tangled', instance: repo.instance, repo, sha },
    sha
  }
}

export async function getTangledCommits(
  provider: ForgeProvider,
  repo: RepoRef,
  ref: string,
  limit = 30,
  cursor?: string
): Promise<Commit[]> {
  const data = await bobbin<{ commits?: CommitRecord[] }>(provider, 'sh.tangled.repo.log', {
    cursor,
    limit,
    ref,
    repo: atUriOf(repo)
  })
  return (data.commits ?? []).map((c) => toCommit(repo, c))
}

interface Fragment {
  OldPosition: number
  OldLines: number
  NewPosition: number
  NewLines: number
  Lines: Array<{ Op: number; Line: string }>
}

function toPatch(fragments: Fragment[]): { additions: number; deletions: number; patch: string } {
  let patch = ''
  let additions = 0
  let deletions = 0
  for (const f of fragments) {
    patch += `@@ -${f.OldPosition},${f.OldLines} +${f.NewPosition},${f.NewLines} @@\n`
    for (const l of f.Lines ?? []) {
      if (l.Op === 1) additions++
      else if (l.Op === 2) deletions++
      patch +=
        (l.Op === 1 ? '+' : l.Op === 2 ? '-' : ' ') +
        (l.Line.endsWith('\n') ? l.Line : `${l.Line}\n`)
    }
  }
  return { additions, deletions, patch }
}

export async function getTangledCommit(
  provider: ForgeProvider,
  repo: RepoRef,
  sha: string
): Promise<Commit> {
  const data = await bobbin<{
    diff?: {
      commit?: CommitRecord
      diff?: Array<{
        name?: { old?: string; new?: string }
        is_new?: boolean
        is_delete?: boolean
        is_rename?: boolean
        is_binary?: boolean
        text_fragments?: Fragment[]
      }>
      stat?: { insertions?: number; deletions?: number }
    }
  }>(provider, 'sh.tangled.repo.diff', { ref: sha, repo: atUriOf(repo) })
  const files: ChangedFile[] = (data.diff?.diff ?? []).map((f) => ({
    ...toPatch(f.text_fragments ?? []),
    isBinary: f.is_binary,
    path: f.name?.new || f.name?.old || '',
    previousPath: f.is_rename ? f.name?.old : undefined,
    status: f.is_new ? 'added' : f.is_delete ? 'removed' : f.is_rename ? 'renamed' : 'modified'
  }))
  return {
    ...toCommit(repo, data.diff?.commit ?? { this: sha }),
    files,
    stats: {
      additions: data.diff?.stat?.insertions ?? 0,
      deletions: data.diff?.stat?.deletions ?? 0
    }
  }
}

interface Pipeline {
  id: string
  commit?: string
  createdAt?: string
  trigger?: { ref?: string }
  workflows?: Array<{
    id?: string
    name?: string
    status?: string
    startedAt?: string
    finishedAt?: string
  }>
}

function stateOf(status?: string): CheckState {
  switch (status) {
    case 'success':
      return 'success'
    case 'failed':
    case 'timeout':
      return 'failure'
    case 'running':
    case 'pending':
      return 'pending'
    case 'cancelled':
      return 'neutral'
    default:
      return 'unknown'
  }
}

function toRun(repo: RepoRef, p: Pipeline): CiRun {
  const states = (p.workflows ?? []).map((w) => stateOf(w.status))
  const state: CheckState = states.includes('failure')
    ? 'failure'
    : states.includes('pending')
      ? 'pending'
      : states.length && states.every((s) => s === 'success')
        ? 'success'
        : 'unknown'
  return {
    branch: p.trigger?.ref?.replace('refs/heads/', ''),
    createdAt: p.createdAt ? new Date(p.createdAt) : undefined,
    name: p.workflows?.[0]?.name || `Pipeline ${p.id.slice(0, 8)}`,
    raw: p,
    ref: { forge: 'tangled', id: p.id, instance: repo.instance, repo },
    sha: p.commit,
    state,
    stateRaw: state
  }
}

export async function listTangledRuns(
  provider: ForgeProvider,
  repo: RepoRef,
  spindle: string | undefined,
  limit = 30
): Promise<CiRun[]> {
  if (!spindle || !repo.externalId) return []
  const res = await provider.request<{ pipelines?: Pipeline[] }>(
    'GET',
    `https://${spindle}/xrpc/sh.tangled.ci.queryPipelines`,
    { query: { limit, repo: repo.externalId } }
  )
  return (res.data.pipelines ?? []).map((p) => toRun(repo, p))
}

export async function getTangledRun(
  provider: ForgeProvider,
  repo: RepoRef,
  spindle: string,
  id: string
): Promise<{ jobs: CiJob[]; run: CiRun }> {
  const res = await provider.request<Pipeline>(
    'GET',
    `https://${spindle}/xrpc/sh.tangled.ci.getPipeline`,
    { query: { pipeline: id } }
  )
  const run = toRun(repo, res.data)
  const jobs = (res.data.workflows ?? []).map((w): CiJob => ({
    completedAt: w.finishedAt ? new Date(w.finishedAt) : undefined,
    name: w.name || w.id || 'workflow',
    raw: w,
    ref: {
      forge: 'tangled',
      id: w.id || w.name || '',
      instance: repo.instance,
      repo,
      run: run.ref
    },
    startedAt: w.startedAt ? new Date(w.startedAt) : undefined,
    state: stateOf(w.status),
    stateRaw: w.status ?? 'unknown'
  }))
  return { jobs, run }
}
