// Pure raw-response -> normalized-type mappers, plus the small stateless
// helpers they share. Nothing here makes a network call.
//
// Most mappers here don't need to know which Gitea-flavored instance they're
// mapping for (Gitea vs Codeberg) and are plain top-level functions. A few
// (mapUser, mapRepo, mapIssue, mapPull, mapComment, repoFromRaw,
// mapSearchIssue, notificationRoute, mapEvent, mapActionRun) stamp the
// forge's own `provider` id and web base URL onto their output, so those are
// grouped behind `createGiteaFamilyMappers`, parameterized once per instance
// the same way `createGiteaFamilyProvider` already is.
import type {
  ForgeActionJob,
  ForgeActionRun,
  ForgeActionStep,
  ForgeComment,
  ForgeCommit,
  ForgeCommitActor,
  ForgeContribution,
  ForgeContributionCommit,
  ForgeEventKind,
  ForgeFileDiff,
  ForgeId,
  ForgeIssue,
  ForgeNotification,
  ForgePull,
  ForgePullState,
  ForgeReactionKind,
  ForgeReactionSummary,
  ForgeRepo,
  ForgeRunStatus,
  ForgeSearchOptions,
  ForgeTreeEntry,
  ForgeUser
} from '~/types/forge'
import type {
  GfActionRunJobResponse,
  GfActionRunResponse,
  GfActivityPushContent,
  GfActivityResponse,
  GfCommentResponse,
  GfCommitActorRaw,
  GfCommitResponse,
  GfFileDiffResponse,
  GfIssueResponse,
  GfLabelResponse,
  GfPullResponse,
  GfReactionResponse,
  GfRepoResponse,
  GfRepoRefContainer,
  GfSearchIssueResponse,
  GfUserResponse
} from './types'
import { issuePath } from '~/utils'

export function loginOf(u: GfUserResponse | null | undefined): string {
  return String(u?.login ?? u?.username ?? '')
}

export function botKindOf(login?: string | null): 'dependabot' | 'renovate' | null {
  const l = String(login ?? '').toLowerCase()
  if (!l) return null
  if (l.includes('dependabot')) return 'dependabot'
  if (l.includes('renovate')) return 'renovate'
  return null
}

/** Gitea's default reaction content set mirrors GitHub's — same strings, no per-instance mapping needed. */
export const GF_REACTION_CONTENT: Record<ForgeReactionKind, string> = {
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

export function mapGfReactions(
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

export function decodeBase64Utf8(b64: string): string {
  const binary = atob(b64.replace(/\s/g, ''))
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function looksBinary(b64: string): boolean {
  try {
    const sample = atob(b64.replace(/\s/g, '').slice(0, 512))
    for (let i = 0; i < sample.length; i++) {
      if (sample.charCodeAt(i) === 0) return true
    }
    return false
  } catch {
    return false
  }
}

export function sortEntries(a: ForgeTreeEntry, b: ForgeTreeEntry): number {
  if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
  return a.name.localeCompare(b.name)
}

export function giteaRunStatus(s?: string): ForgeRunStatus {
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

export function mapCommitActor(
  gitActor: GfCommitActorRaw | null | undefined,
  user: GfUserResponse | null | undefined
): ForgeCommitActor | undefined {
  if (!gitActor && !user) return undefined
  return {
    name: gitActor?.name,
    email: gitActor?.email,
    when: gitActor?.date ?? gitActor?.timestamp,
    login: loginOf(user) || undefined,
    avatarUrl: user?.avatar_url ?? null
  }
}

export function mapCommit(r: GfCommitResponse): ForgeCommit {
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

export function mapFileDiff(f: GfFileDiffResponse, patch?: string | null): ForgeFileDiff {
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

/** Split a multi-file unified diff into one chunk per path, keyed by the "b/" (new) path. */
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

function mapLabel(l: GfLabelResponse | string): {
  name: string
  color?: string | null
  description?: string | null
} {
  if (typeof l === 'string') return { name: l }
  return { name: l.name, color: l.color, description: l.description }
}

export function pullState(r: GfPullResponse): ForgePullState {
  if (r.merged_at || r.merged) return 'merged'
  if (r.state === 'closed') return 'closed'
  if (r.draft) return 'draft'
  return 'open'
}

export function topLanguage(languages: Record<string, number> | null | undefined): string | null {
  const entries = Object.entries(languages ?? {})
  entries.sort((a, b) => b[1] - a[1])
  return entries[0]?.[0] ?? null
}

export function mapSort(sort?: ForgeSearchOptions['sort']): string | undefined {
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

export function notificationKind(type: string): ForgeNotification['kind'] {
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

export function notificationNumber(url?: string): number | undefined {
  const m = String(url ?? '').match(/\/(?:issues|pulls)\/(\d+)(?:$|[/?#])/)
  if (!m?.[1]) return undefined
  return Number(m[1])
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

export function eventKind(op: string): ForgeEventKind {
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

/**
 * The activity feed's `content` field for a commit_repo action is itself a
 * JSON-encoded string — `{"Commits":[{"Sha1":...,"Message":...}, ...], ...}`
 * (verified live against both codeberg.org and gitea.com) — not the plain
 * `sha|message` lines the field name might suggest. Older/self-hosted
 * instances may still emit that legacy line format, so fall back to it when
 * the content isn't valid JSON.
 */
export function parseActivityCommits(
  content: string | null | undefined
): ForgeContributionCommit[] {
  if (!content) return []

  try {
    const parsed = JSON.parse(content) as GfActivityPushContent
    if (Array.isArray(parsed.Commits)) {
      return parsed.Commits.map(
        (c): ForgeContributionCommit => ({
          sha: c.Sha1,
          message: (c.Message ?? '').split('\n')[0] ?? ''
        })
      ).filter((c) => c.message)
    }
  } catch {
    // Not JSON — fall through to the legacy line format below.
  }

  return content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const sep = line.indexOf('|')
      return sep === -1
        ? { message: line }
        : { sha: line.slice(0, sep) || undefined, message: line.slice(sep + 1) }
    })
    .filter((c) => c.message)
}

export function mapActionRun(
  providerId: ForgeId,
  mapUser: (u: GfUserResponse | null | undefined) => ForgeUser | undefined,
  r: GfActionRunResponse
): ForgeActionRun {
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

export function mapActionJob(j: GfActionRunJobResponse): ForgeActionJob {
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

/**
 * Mappers whose output carries this specific instance's `provider` id and web
 * base URL (Gitea vs Codeberg, ...) — parameterized once per instance, the
 * same way `createGiteaFamilyProvider` already is.
 */
export function createGiteaFamilyMappers(providerId: ForgeId, webBase: string) {
  function mapUser(u: GfUserResponse | null | undefined): ForgeUser | undefined {
    if (!u) return undefined
    const login = loginOf(u)
    return {
      provider: providerId,
      login,
      displayName: u.full_name ?? u.fullname ?? null,
      avatarUrl: u.avatar_url ?? null,
      url: u.html_url ?? (login ? `${webBase}/${login}` : null)
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
      url: r.html_url ?? (owner && r.name ? `${webBase}/${owner}/${r.name}` : webBase),
      ownerUrl: r.owner?.html_url ?? (owner ? `${webBase}/${owner}` : undefined),
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
      updatedAt: r.updated_at ?? null,
      features:
        r.has_issues === undefined && r.has_pull_requests === undefined
          ? undefined
          : { issues: r.has_issues, pulls: r.has_pull_requests }
    }
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
    if (!owner || !name) return undefined
    return {
      provider: providerId,
      owner,
      name,
      fullName: fullName || `${owner}/${name}`,
      url: raw?.html_url ?? `${webBase}/${owner}/${name}`
    }
  }

  function mapSearchIssue(r: GfSearchIssueResponse, isPull?: boolean): ForgeIssue {
    const issue = mapIssue(r)
    issue.isPull = isPull ?? issue.isPull
    const repo = repoFromRaw(r)
    if (repo) issue.repo = repo
    return issue
  }

  function notificationRoute(
    kind: ForgeNotification['kind'],
    owner: string,
    name: string,
    number?: number
  ): string | null {
    if (!owner || !name) return null
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

  function mapEvent(e: GfActivityResponse): ForgeContribution | null {
    const actor = mapUser(e.act_user)
    const repo = repoFromRaw(e.repo)
    if (!actor || !repo) return null
    const kind = eventKind(String(e.op_type ?? ''))
    const baseUrl = repo.url ?? `${webBase}/${repo.fullName}`

    let title: string | null | undefined
    let url = e.ref_name
      ? `${baseUrl}/src/branch/${encodeURIComponent(String(e.ref_name))}`
      : baseUrl
    let count: number | undefined
    let commits: ForgeContributionCommit[] | undefined

    if (kind === 'push') {
      commits = parseActivityCommits(e.content).map((c) => ({
        ...c,
        url: c.sha ? `${baseUrl}/commit/${c.sha}` : null
      }))
      count = commits.length || undefined
      title = commits[0]?.message
      if (commits[0]?.sha) url = `${baseUrl}/commit/${commits[0].sha}`
    } else if (e.ref_name) {
      title = e.ref_name
    } else if (e.content) {
      // Not always a title-shaped string (e.g. issue/PR bodies for some op
      // types), but a lone free-text line reads better than the repo slug.
      title = e.content.split('\n')[0]
    }

    return {
      provider: providerId,
      id: String(e.id ?? `${e.op_type}-${e.created}`),
      kind,
      actor,
      repo,
      title,
      url,
      count,
      commits,
      createdAt: String(e.created ?? e.created_at ?? ''),
      refType: e.ref_name ? 'ref' : undefined,
      impact: EVENT_IMPACT[kind]
    }
  }

  return {
    mapUser,
    mapRepo,
    mapIssue,
    mapPull,
    mapComment,
    repoFromRaw,
    mapSearchIssue,
    notificationRoute,
    mapEvent,
    mapActionRun: (r: GfActionRunResponse) => mapActionRun(providerId, mapUser, r)
  }
}
