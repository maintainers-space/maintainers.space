// Pure raw-response -> normalized-type mappers, plus the small stateless
// helpers they share. Nothing here makes a network call.
import type {
  ForgeActionJob,
  ForgeActionRun,
  ForgeComment,
  ForgeCommit,
  ForgeCommitActor,
  ForgeContribution,
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
  ForgeTreeEntry,
  ForgeUser
} from '~/types/forge'
import type {
  GlAwardEmojiResponse,
  GlCommitResponse,
  GlDiffResponse,
  GlEventResponse,
  GlIssueResponse,
  GlJobResponse,
  GlMergeRequestResponse,
  GlMrStateFields,
  GlNoteResponse,
  GlPipelineResponse,
  GlProjectResponse,
  GlTodoResponse,
  GlUserResponse
} from './types'

const WEB = 'https://gitlab.com'

/** GitLab's Award Emoji names — a superset that includes the classic 8-emoji set under gemoji names. */
export const GL_REACTION_NAME: Record<ForgeReactionKind, string> = {
  thumbsup: 'thumbsup',
  thumbsdown: 'thumbsdown',
  laugh: 'laughing',
  hooray: 'tada',
  confused: 'confused',
  heart: 'heart',
  rocket: 'rocket',
  eyes: 'eyes'
}

const GL_REACTION_FROM_NAME: Record<string, ForgeReactionKind> = Object.fromEntries(
  (Object.entries(GL_REACTION_NAME) as [ForgeReactionKind, string][]).map(([kind, name]) => [
    name,
    kind
  ])
)

export function mapAwards(
  awards: GlAwardEmojiResponse[],
  myUsername: string | null
): ForgeReactionSummary[] | undefined {
  const byKind = new Map<ForgeReactionKind, { count: number; mine: boolean }>()
  for (const a of awards) {
    const kind = GL_REACTION_FROM_NAME[a.name]
    if (!kind) continue
    const entry = byKind.get(kind) ?? { count: 0, mine: false }
    entry.count++
    if (myUsername && a.user?.username === myUsername) entry.mine = true
    byKind.set(kind, entry)
  }
  if (!byKind.size) return undefined
  return Array.from(byKind.entries()).map(([kind, v]) => ({
    kind,
    count: v.count,
    viewerReacted: v.mine
  }))
}

export function botKindOf(login?: string | null): 'dependabot' | 'renovate' | null {
  const l = String(login ?? '').toLowerCase()
  if (!l) return null
  if (l.includes('dependabot')) return 'dependabot'
  if (l.includes('renovate')) return 'renovate'
  return null
}

export function sortEntries(a: ForgeTreeEntry, b: ForgeTreeEntry): number {
  if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
  return a.name.localeCompare(b.name)
}

export function decodeBase64Utf8(b64: string): string {
  const binary = atob(b64.replace(/\s/g, ''))
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function looksBinary(b64: string): boolean {
  try {
    const sample = atob(b64.replace(/\s/g, '').slice(0, 512))
    for (let i = 0; i < sample.length; i++) if (sample.charCodeAt(i) === 0) return true
    return false
  } catch {
    return false
  }
}

export function mapUser(u: GlUserResponse | null | undefined): ForgeUser | undefined {
  if (!u) return undefined
  return {
    provider: 'gitlab',
    login: u.username ?? '',
    displayName: u.name ?? null,
    avatarUrl: u.avatar_url ?? null,
    url: u.web_url ?? (u.username ? `${WEB}/${u.username}` : null)
  }
}

export function mapRepo(r: GlProjectResponse): ForgeRepo {
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
    features:
      r.issues_enabled === undefined && r.merge_requests_enabled === undefined
        ? undefined
        : { issues: r.issues_enabled, pulls: r.merge_requests_enabled },
    ref: { id: r.id }
  }
}

export function mapCommit(r: GlCommitResponse): ForgeCommit {
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

export function mapDiff(f: GlDiffResponse): ForgeFileDiff {
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
export function projectBaseOf(webUrl?: string): string {
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

export function mapIssue(r: GlIssueResponse): ForgeIssue {
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

export function mrState(r: GlMrStateFields): ForgePullState {
  if (r.state === 'merged' || r.merged_at) return 'merged'
  if (r.state === 'closed') return 'closed'
  if (r.draft || r.work_in_progress) return 'draft'
  return 'open'
}

export function mapPull(r: GlMergeRequestResponse): ForgePull {
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
export function mapNote(r: GlNoteResponse, base = ''): ForgeComment {
  return {
    id: String(r.id),
    author: mapUser(r.author),
    body: absolutizeUploads(r.body, base) ?? '',
    createdAt: r.created_at ?? null
  }
}

export function glRunStatus(s?: string): ForgeRunStatus {
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

export function mapPipeline(r: GlPipelineResponse): ForgeActionRun {
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

export function mapJob(j: GlJobResponse): ForgeActionJob {
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
export function mapEvent(
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
export function workItem(r: GlIssueResponse | GlMergeRequestResponse, isPull: boolean): ForgeIssue {
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

export function todoKind(t: GlTodoResponse): ForgeNotification['kind'] {
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

export function todoRepo(t: GlTodoResponse): { owner: string; name: string; fullName: string } {
  const full = String(t.project?.path_with_namespace ?? '')
  const owner = t.project?.namespace?.full_path ?? full.split('/').slice(0, -1).join('/')
  const name = t.project?.path ?? full.split('/').pop() ?? ''
  return { owner, name, fullName: full }
}

export function todoRoute(
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

export function mapTodoReason(action?: string): string | undefined {
  return action ? (TODO_REASONS[action] ?? action) : undefined
}
