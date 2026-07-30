// Pure raw-response -> normalized-type mappers, plus the small stateless
// helpers they share. Nothing here makes a network call.
import type {
  ForgeActionJob,
  ForgeActionRun,
  ForgeComment,
  ForgeCommit,
  ForgeCommitActor,
  ForgeContribution,
  ForgeContributionCommit,
  ForgeDiscussion,
  ForgeEventKind,
  ForgeFileDiff,
  ForgeIssue,
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
  GhActionJobResponse,
  GhActionRunResponse,
  GhCommentResponse,
  GhCommitGitActor,
  GhCommitResponse,
  GhEventResponse,
  GhFileDiffResponse,
  GhGraphqlDiscussionCommentNode,
  GhGraphqlDiscussionNode,
  GhGraphqlReactionGroup,
  GhIssueResponse,
  GhPullResponse,
  GhReactionsResponse,
  GhRepoResponse,
  GhUserResponse
} from './types'

/** Classify a login as a known dependency bot, else null. */
export function botKindOf(login?: string | null): 'dependabot' | 'renovate' | null {
  const l = String(login ?? '').toLowerCase()
  if (!l) return null
  if (l.includes('dependabot')) return 'dependabot'
  if (l.includes('renovate')) return 'renovate'
  return null
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
      const c = sample.charCodeAt(i)
      if (c === 0) return true
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

export function mapUser(u: GhUserResponse | null | undefined): ForgeUser | undefined {
  if (!u) return undefined
  return {
    provider: 'github',
    login: u.login ?? '',
    avatarUrl: u.avatar_url ?? null,
    url: u.html_url ?? null
  }
}

export function mapCommitActor(
  gitActor: GhCommitGitActor | null | undefined,
  ghUser: GhUserResponse | null | undefined
): ForgeCommitActor | undefined {
  if (!gitActor && !ghUser) return undefined
  return {
    name: gitActor?.name,
    email: gitActor?.email,
    when: gitActor?.date,
    login: ghUser?.login,
    avatarUrl: ghUser?.avatar_url ?? null
  }
}

export function mapRepo(r: GhRepoResponse): ForgeRepo {
  return {
    provider: 'github',
    owner: r.owner?.login ?? '',
    name: r.name,
    fullName: r.full_name ?? `${r.owner?.login ?? ''}/${r.name}`,
    description: r.description ?? null,
    defaultBranch: r.default_branch || 'main',
    url: r.html_url,
    ownerUrl: r.owner?.html_url ?? undefined,
    ownerAvatar: r.owner?.avatar_url ?? null,
    homepage: r.homepage || null,
    language: r.language ?? null,
    topics: r.topics ?? [],
    stars: r.stargazers_count,
    forks: r.forks_count,
    watchers: r.subscribers_count ?? r.watchers_count,
    issues: r.open_issues_count,
    isPrivate: r.private,
    isFork: r.fork,
    license: r.license?.spdx_id ?? null,
    createdAt: r.created_at ?? null,
    updatedAt: r.pushed_at ?? r.updated_at ?? null,
    features:
      r.has_issues === undefined && r.has_discussions === undefined
        ? undefined
        : { issues: r.has_issues, discussions: r.has_discussions }
  }
}

export function mapIssue(r: GhIssueResponse): ForgeIssue {
  return {
    provider: 'github',
    id: String(r.number),
    number: r.number,
    title: r.title,
    state: r.state === 'closed' ? 'closed' : 'open',
    author: mapUser(r.user),
    body: r.body ?? null,
    commentCount: r.comments,
    labels: (r.labels ?? []).map((l) =>
      typeof l === 'string'
        ? { name: l }
        : { name: l.name, color: l.color, description: l.description }
    ),
    createdAt: r.created_at ?? null,
    updatedAt: r.updated_at ?? null,
    closedAt: r.closed_at ?? null,
    url: r.html_url,
    isPull: !!r.pull_request
  }
}

export function pullState(r: GhPullResponse): ForgePullState {
  if (r.merged_at || r.merged) return 'merged'
  if (r.state === 'closed') return 'closed'
  if (r.draft) return 'draft'
  return 'open'
}

export function mapPull(r: GhPullResponse): ForgePull {
  return {
    provider: 'github',
    id: String(r.number),
    number: r.number,
    title: r.title,
    state: pullState(r),
    author: mapUser(r.user),
    body: r.body ?? null,
    commentCount: r.comments,
    labels: (r.labels ?? []).map((l) => ({ name: l.name, color: l.color })),
    sourceBranch: r.head?.ref,
    targetBranch: r.base?.ref,
    createdAt: r.created_at ?? null,
    updatedAt: r.updated_at ?? null,
    mergedAt: r.merged_at ?? null,
    closedAt: r.closed_at ?? null,
    url: r.html_url
  }
}

/** REST reaction `content` values. Every reacting forge (GitHub/GitLab/Gitea) accepts this same set. */
export const GH_REACTION_CONTENT: Record<ForgeReactionKind, keyof GhReactionsResponse> = {
  thumbsup: '+1',
  thumbsdown: '-1',
  laugh: 'laugh',
  hooray: 'hooray',
  confused: 'confused',
  heart: 'heart',
  rocket: 'rocket',
  eyes: 'eyes'
}

/** GraphQL `ReactionContent` enum values, used for Discussions (Discussions have no REST reactions API). */
export const GH_REACTION_GRAPHQL: Record<ForgeReactionKind, string> = {
  thumbsup: 'THUMBS_UP',
  thumbsdown: 'THUMBS_DOWN',
  laugh: 'LAUGH',
  hooray: 'HOORAY',
  confused: 'CONFUSED',
  heart: 'HEART',
  rocket: 'ROCKET',
  eyes: 'EYES'
}

export function mapReactions(r?: GhReactionsResponse): ForgeReactionSummary[] | undefined {
  if (!r) return undefined
  const summaries = (Object.keys(GH_REACTION_CONTENT) as ForgeReactionKind[])
    .map(
      (kind): ForgeReactionSummary => ({
        kind,
        count: r[GH_REACTION_CONTENT[kind]] ?? 0,
        // GitHub's REST reaction summary has no per-viewer info; the reaction bar
        // tracks "mine" optimistically from the viewer's own clicks this session.
        viewerReacted: false
      })
    )
    .filter((s) => s.count > 0)
  return summaries.length ? summaries : undefined
}

const GH_REACTION_FROM_GRAPHQL: Record<string, ForgeReactionKind> = Object.fromEntries(
  (Object.entries(GH_REACTION_GRAPHQL) as [ForgeReactionKind, string][]).map(([kind, content]) => [
    content,
    kind
  ])
)

/** Discussions/discussion comments carry real viewer-reacted info via GraphQL, unlike the REST summary. */
export function mapReactionGroups(
  groups?: GhGraphqlReactionGroup[]
): ForgeReactionSummary[] | undefined {
  if (!groups?.length) return undefined
  const summaries = groups
    .map((g): ForgeReactionSummary | null => {
      const kind = GH_REACTION_FROM_GRAPHQL[g.content]
      if (!kind) return null
      return { kind, count: g.users?.totalCount ?? 0, viewerReacted: !!g.viewerHasReacted }
    })
    .filter((s): s is ForgeReactionSummary => !!s && s.count > 0)
  return summaries.length ? summaries : undefined
}

export function mapComment(r: GhCommentResponse): ForgeComment {
  return {
    id: String(r.id),
    author: mapUser(r.user),
    body: r.body ?? '',
    createdAt: r.created_at ?? null,
    url: r.html_url,
    reactions: mapReactions(r.reactions)
  }
}

export function mapCommit(r: GhCommitResponse): ForgeCommit {
  const sha: string = r.sha
  return {
    sha,
    shortSha: sha ? sha.slice(0, 7) : '',
    message: r.commit?.message ?? '',
    author: mapCommitActor(r.commit?.author, r.author),
    committer: mapCommitActor(r.commit?.committer, r.committer),
    url: r.html_url,
    parents: (r.parents ?? []).map((p) => p.sha)
  }
}

export function mapFileDiff(f: GhFileDiffResponse): ForgeFileDiff {
  const status: ForgeFileDiff['status'] =
    f.status === 'added'
      ? 'added'
      : f.status === 'removed'
        ? 'removed'
        : f.status === 'renamed'
          ? 'renamed'
          : f.status === 'copied'
            ? 'copied'
            : f.status === 'changed'
              ? 'changed'
              : 'modified'
  return {
    oldPath: f.previous_filename,
    path: f.filename,
    status,
    additions: f.additions,
    deletions: f.deletions,
    isBinary: f.patch == null && f.changes === 0,
    patch: f.patch ?? null
  }
}

export function ghRunStatus(
  status: string | null | undefined,
  conclusion: string | null | undefined
): ForgeRunStatus {
  if (status && status !== 'completed')
    return status === 'queued' || status === 'waiting' || status === 'pending'
      ? 'queued'
      : 'running'
  switch (conclusion) {
    case 'success':
      return 'success'
    case 'failure':
      return 'failure'
    case 'cancelled':
      return 'cancelled'
    case 'skipped':
      return 'skipped'
    case 'timed_out':
      return 'timed_out'
    default:
      return 'unknown'
  }
}

export function mapRun(r: GhActionRunResponse): ForgeActionRun {
  return {
    provider: 'github',
    id: String(r.id),
    name: r.name || r.display_title || `Run #${r.run_number}`,
    status: ghRunStatus(r.status, r.conclusion),
    event: r.event,
    branch: r.head_branch,
    commitSha: r.head_sha,
    commitMessage: r.head_commit?.message,
    actor: mapUser(r.actor),
    createdAt: r.created_at ?? null,
    updatedAt: r.updated_at ?? null,
    url: r.html_url
  }
}

export function mapJob(j: GhActionJobResponse): ForgeActionJob {
  return {
    id: String(j.id),
    name: j.name,
    status: ghRunStatus(j.status, j.conclusion),
    startedAt: j.started_at ?? null,
    completedAt: j.completed_at ?? null,
    url: j.html_url,
    steps: (j.steps ?? []).map((s) => ({
      name: s.name,
      number: s.number,
      status: ghRunStatus(s.status, s.conclusion),
      startedAt: s.started_at ?? null,
      completedAt: s.completed_at ?? null
    }))
  }
}

export function mapDiscussion(d: GhGraphqlDiscussionNode): ForgeDiscussion {
  return {
    provider: 'github',
    id: String(d.number),
    number: d.number,
    title: d.title,
    category: d.category?.name ?? null,
    author: d.author
      ? {
          provider: 'github',
          login: d.author.login ?? '',
          avatarUrl: d.author.avatarUrl,
          url: d.author.url
        }
      : undefined,
    commentCount: d.comments?.totalCount,
    createdAt: d.createdAt,
    url: d.url,
    answered: !!d.answerChosenAt
  }
}

export function mapDiscussionComment(c: GhGraphqlDiscussionCommentNode): ForgeComment {
  return {
    id: String(c.id),
    author: c.author
      ? {
          provider: 'github',
          login: c.author.login ?? '',
          avatarUrl: c.author.avatarUrl,
          url: c.author.url
        }
      : undefined,
    body: c.body ?? '',
    createdAt: c.createdAt,
    url: c.url,
    replies: c.replies?.nodes?.map(mapDiscussionComment),
    reactions: mapReactionGroups(c.reactionGroups)
  }
}

/** Relative "impact" weight per event kind, used to rank the friends feed. */
export const EVENT_IMPACT: Record<ForgeEventKind, number> = {
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

/** Map a raw GitHub events-API item into a normalized contribution (or null). */
export function mapEvent(e: GhEventResponse): ForgeContribution | null {
  const type = String(e?.type ?? '')
  const actor = mapUser({
    login: e?.actor?.login,
    avatar_url: e?.actor?.avatar_url,
    html_url: `https://github.com/${e?.actor?.login}`
  })
  const repoFull = String(e?.repo?.name ?? '')
  const [owner = '', name = ''] = repoFull.split('/')
  if (!actor || !owner || !name) return null
  const repo = { owner, name, fullName: repoFull, url: `https://github.com/${repoFull}` }
  const base = {
    provider: 'github' as const,
    id: String(e.id),
    actor,
    repo,
    createdAt: String(e.created_at ?? '')
  }
  const p = e.payload ?? {}

  let kind: ForgeEventKind
  let title: string | null | undefined
  let url: string | null | undefined
  let number: number | undefined
  let count: number | undefined
  let refType: string | undefined
  let commits: ForgeContributionCommit[] | undefined

  switch (type) {
    case 'PushEvent': {
      kind = 'push'
      const rawCommits = Array.isArray(p.commits) ? p.commits : []
      // GitHub's public events API stopped including `size`/`commits` on
      // PushEvent payloads — leave the count unknown rather than claiming 0.
      count = p.size ?? (rawCommits.length || undefined)
      const head = rawCommits[rawCommits.length - 1]
      title = head?.message?.split('\n')[0]
      const headSha = p.head ?? head?.sha
      url = headSha
        ? `https://github.com/${repoFull}/commit/${headSha}`
        : `https://github.com/${repoFull}/commits/${String(p.ref ?? '').replace('refs/heads/', '')}`
      commits = rawCommits
        // GitHub lists oldest-first within a push — newest-first reads better.
        .toReversed()
        .map((rc) => ({
          sha: rc.sha,
          message: (rc.message ?? '').split('\n')[0] ?? '',
          url: rc.sha ? `https://github.com/${repoFull}/commit/${rc.sha}` : null
        }))
      break
    }
    case 'PullRequestEvent': {
      const merged = !!p.pull_request?.merged
      kind =
        p.action === 'closed' && merged
          ? 'pr_merged'
          : p.action === 'opened' || p.action === 'reopened'
            ? 'pr_opened'
            : 'other'
      title = p.pull_request?.title
      number = p.number ?? p.pull_request?.number
      url = p.pull_request?.html_url
      break
    }
    case 'PullRequestReviewEvent': {
      kind = 'pr_review'
      title = p.pull_request?.title
      number = p.pull_request?.number
      url = p.review?.html_url ?? p.pull_request?.html_url
      break
    }
    case 'IssuesEvent': {
      kind =
        p.action === 'closed'
          ? 'issue_closed'
          : p.action === 'opened' || p.action === 'reopened'
            ? 'issue_opened'
            : 'other'
      title = p.issue?.title
      number = p.issue?.number
      url = p.issue?.html_url
      break
    }
    case 'IssueCommentEvent':
    case 'PullRequestReviewCommentEvent':
    case 'CommitCommentEvent': {
      kind = 'comment'
      title = p.issue?.title ?? p.pull_request?.title
      number = p.issue?.number ?? p.pull_request?.number
      url = p.comment?.html_url
      break
    }
    case 'CreateEvent': {
      kind = 'create'
      refType = p.ref_type
      title = p.ref ? `${p.ref_type} ${p.ref}` : p.ref_type
      url =
        p.ref && p.ref_type !== 'repository'
          ? `https://github.com/${repoFull}/tree/${p.ref}`
          : `https://github.com/${repoFull}`
      break
    }
    case 'ReleaseEvent': {
      kind = 'release'
      title = p.release?.name || p.release?.tag_name
      url = p.release?.html_url
      break
    }
    case 'ForkEvent': {
      kind = 'fork'
      url = p.forkee?.html_url
      break
    }
    case 'WatchEvent': {
      kind = 'star'
      url = repo.url
      break
    }
    default:
      return null
  }

  return { ...base, kind, title, url, number, count, refType, commits, impact: EVENT_IMPACT[kind] }
}
