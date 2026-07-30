import type {
  ForgeCommit,
  ForgeCommitActor,
  ForgeComment,
  ForgeFileDiff,
  ForgeId,
  ForgePull,
  ForgePullState,
  ForgeRepo,
  ForgeTreeEntry,
  ForgeUser
} from '~/types/forge'
import type {
  BbAccountResponse,
  BbCommentResponse,
  BbCommitResponse,
  BbDiffstatEntryResponse,
  BbPrResponse,
  BbRepoRefResponse,
  BbRepoResponse,
  BbSrcEntryResponse
} from './types'

export const WEB = 'https://bitbucket.org'

/** `login` for a Bitbucket account: nickname (the closest thing left to a stable handle) or the account UUID. */
export function loginOf(u: BbAccountResponse | null | undefined): string {
  return String(u?.nickname ?? u?.uuid ?? '')
}

export function mapUser(u: BbAccountResponse | null | undefined): ForgeUser | undefined {
  if (!u) return undefined
  return {
    provider: 'bitbucket',
    login: loginOf(u),
    displayName: u.display_name ?? null,
    avatarUrl: u.links?.avatar?.href ?? null,
    url: u.links?.html?.href ?? null
  }
}

export function mapRepo(r: BbRepoResponse): ForgeRepo {
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

export function repoRefFrom(
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

export function pullState(s?: string): ForgePullState {
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

export function mapPull(r: BbPrResponse): ForgePull {
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

export function mapComment(r: BbCommentResponse): ForgeComment {
  return {
    id: String(r.id ?? ''),
    author: mapUser(r.user),
    body: r.content?.raw ?? '',
    createdAt: r.created_on ?? null,
    url: r.links?.html?.href
  }
}

/** Bitbucket's commit `author.raw` is a raw git identity string: "Name <email>". */
export function mapCommit(r: BbCommitResponse): ForgeCommit {
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

export function diffFileStatus(status?: string): ForgeFileDiff['status'] {
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

export function mapDiffstat(d: BbDiffstatEntryResponse): ForgeFileDiff {
  return {
    oldPath: d.old?.path,
    path: d.new?.path ?? d.old?.path ?? '',
    status: diffFileStatus(d.status),
    additions: d.lines_added,
    deletions: d.lines_removed,
    isBinary: false
  }
}

export function splitUnifiedDiff(text: string): Record<string, string> {
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

export function sortEntries(a: ForgeTreeEntry, b: ForgeTreeEntry): number {
  if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
  return a.name.localeCompare(b.name)
}

export function mapTreeEntry(e: BbSrcEntryResponse): ForgeTreeEntry {
  const path = e.path ?? ''
  return {
    name: path.split('/').pop() || path,
    path,
    type: e.type === 'commit_directory' ? 'dir' : 'file',
    size: e.size
  }
}
