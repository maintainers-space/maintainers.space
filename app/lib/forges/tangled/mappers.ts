import type {
  ForgeActionJob,
  ForgeActionRun,
  ForgeCommit,
  ForgeId,
  ForgeIssue,
  ForgePull,
  ForgePullState,
  ForgeRepo,
  ForgeRunStatus,
  ForgeTreeEntry,
  ForgeUser
} from '~/types/forge'
import type {
  ResolvedRepo,
  TangledCommitRecord,
  TangledFragment,
  TangledIssueRecord,
  TangledPipeline,
  TangledPullRecord,
  TangledTree
} from './types'

export function rkeyFromUri(uri: string): string {
  return uri.split('/').pop() ?? ''
}

export function didFromUri(uri: string): string {
  return uri.replace('at://', '').split('/')[0] ?? ''
}

// Git mode 0040000 == directory.
export function isDirMode(mode: string): boolean {
  return typeof mode === 'string' && mode.startsWith('004')
}

export function sortEntries(a: ForgeTreeEntry, b: ForgeTreeEntry): number {
  if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
  return a.name.localeCompare(b.name)
}

export function tangledUser(did: string): ForgeUser {
  return { provider: 'tangled', login: did, ref: { did } }
}

export function mapTreeFiles(tree: TangledTree, basePath = ''): ForgeTreeEntry[] {
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

export function makeRepo(
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

export function fragmentsToPatch(fragments: TangledFragment[]): string {
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

export function countPatch(fragments: TangledFragment[]): {
  additions: number
  deletions: number
} {
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

export function ciStatus(s?: string): ForgeRunStatus {
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

export function rollupStatus(workflows: Array<{ status?: string }>): ForgeRunStatus {
  const statuses = workflows.map((w) => ciStatus(w.status))
  if (statuses.some((s) => s === 'failure')) return 'failure'
  if (statuses.some((s) => s === 'running' || s === 'pending' || s === 'queued')) return 'running'
  if (statuses.some((s) => s === 'timed_out')) return 'timed_out'
  if (statuses.some((s) => s === 'cancelled')) return 'cancelled'
  if (statuses.length && statuses.every((s) => s === 'success')) return 'success'
  return 'unknown'
}

export function mapPipeline(p: TangledPipeline): ForgeActionRun {
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

export function mapTangledCommit(c: TangledCommitRecord): ForgeCommit {
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

export function mapTangledIssue(it: TangledIssueRecord): ForgeIssue {
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

export function tangledPullState(it: TangledPullRecord): ForgePullState {
  const s = it.state ?? it.status
  if (s === 'merged') return 'merged'
  if (s === 'closed') return 'closed'
  return 'open'
}

export function mapTangledPull(it: TangledPullRecord): ForgePull {
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

/** A Tangled pull, reshaped into `ForgeIssue` for the home dashboard's "my work" feed. */
export function pullAsWorkItem(
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
