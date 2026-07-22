// Shared types for the multi-forge abstraction layer.
// A "forge" is any code host (GitHub, Tangled, GitLab, Gitea, Forgejo, ...).

export type ForgeId = 'github' | 'gitlab' | 'tangled' | 'codeberg' | (string & {})

export interface ForgeReadOptions {
  /** Optional bearer token for authenticated forge APIs (e.g. GitHub PAT). */
  token?: string
  /** Signed-in viewer identity (DID/handle) for forges that use atproto sessions instead of a token. */
  viewer?: string
  signal?: AbortSignal
}

export interface ForgePageOptions extends ForgeReadOptions {
  limit?: number
  cursor?: string
}

/** A generic, cursor-based paginated result set. */
export interface Paginated<T> {
  items: T[]
  cursor?: string
  /** Total count when the provider reports one. */
  total?: number
  /** True when the provider returned incomplete/approximate results. */
  incomplete?: boolean
}

/** A lightweight person reference used across issues, PRs, commits and search. */
export interface ForgeUser {
  provider: ForgeId
  login: string
  displayName?: string | null
  avatarUrl?: string | null
  url?: string | null
  /** Provider-specific handle (DID, AT-URI, ...). */
  ref?: Record<string, unknown>
}

export interface ForgeLabel {
  name: string
  color?: string | null
  description?: string | null
}

export interface ForgeRepo {
  provider: ForgeId
  owner: string
  name: string
  fullName: string
  description?: string | null
  defaultBranch: string
  /** Canonical web URL of the repository on the forge. */
  url: string
  ownerUrl?: string
  ownerAvatar?: string | null
  homepage?: string | null
  language?: string | null
  topics?: string[]
  stars?: number
  forks?: number
  watchers?: number
  issues?: number
  isPrivate?: boolean
  isFork?: boolean
  license?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  /** Provider-specific handles (AT-URI, knot, repoDid, ...) for follow-up calls. */
  ref?: Record<string, unknown>
}

/** Minimal handle used to address a repo in follow-up calls without re-resolving. */
export interface RepoLocator {
  owner: string
  name: string
  ref?: Record<string, unknown>
}

export interface ForgeTreeEntry {
  name: string
  path: string
  type: 'file' | 'dir'
  size?: number
  sha?: string
  lastCommit?: {
    message?: string
    when?: string
    hash?: string
  }
}

export interface ForgeReadme {
  filename: string
  content: string
}

export interface ForgeBlob {
  path: string
  ref: string
  content: string
  encoding: 'utf-8' | 'base64'
  isBinary: boolean
  size?: number
  mimeType?: string | null
}

export interface ForgeBranch {
  name: string
  isDefault?: boolean
  commit?: { sha?: string, message?: string, when?: string }
}

export interface RepoOverview {
  repo: ForgeRepo
  entries: ForgeTreeEntry[]
  readme: ForgeReadme | null
}

export interface ForgeCommitActor {
  name?: string
  email?: string
  login?: string
  avatarUrl?: string | null
  when?: string
}

export interface ForgeCommit {
  sha: string
  shortSha: string
  message: string
  author?: ForgeCommitActor
  committer?: ForgeCommitActor
  url?: string | null
  parents?: string[]
}

export type ForgeFileStatus = 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed'

export interface ForgeFileDiff {
  oldPath?: string
  path: string
  status: ForgeFileStatus
  additions?: number
  deletions?: number
  isBinary?: boolean
  /** Unified-diff hunk text (git patch, no file header required). */
  patch?: string | null
}

export interface ForgeDiffStat {
  additions?: number
  deletions?: number
  filesChanged?: number
}

export interface ForgeCommitDetail extends ForgeCommit {
  stat?: ForgeDiffStat
  files?: ForgeFileDiff[]
}

export type ForgeIssueState = 'open' | 'closed'

export interface ForgeIssue {
  provider: ForgeId
  /** Routeable id (GitHub number as string, Tangled rkey/TID). */
  id: string
  /** Human number when the provider has one. */
  number?: number
  title: string
  state: ForgeIssueState
  author?: ForgeUser
  body?: string | null
  commentCount?: number
  labels?: ForgeLabel[]
  createdAt?: string | null
  updatedAt?: string | null
  closedAt?: string | null
  url?: string | null
  /** Owning repo (populated in search results). */
  repo?: { provider: ForgeId, owner: string, name: string, fullName: string, url?: string }
  /** True when this row is actually a pull request (GitHub search mixes them). */
  isPull?: boolean
  ref?: Record<string, unknown>
}

export interface ForgeComment {
  id: string
  author?: ForgeUser
  body: string
  createdAt?: string | null
  url?: string | null
}

export interface ForgeIssueDetail extends ForgeIssue {
  comments: ForgeComment[]
}

export type ForgePullState = 'open' | 'closed' | 'merged' | 'draft'

export interface ForgePull {
  provider: ForgeId
  id: string
  number?: number
  title: string
  state: ForgePullState
  author?: ForgeUser
  body?: string | null
  commentCount?: number
  labels?: ForgeLabel[]
  sourceBranch?: string
  targetBranch?: string
  createdAt?: string | null
  updatedAt?: string | null
  mergedAt?: string | null
  closedAt?: string | null
  url?: string | null
  repo?: { provider: ForgeId, owner: string, name: string, fullName: string, url?: string }
  ref?: Record<string, unknown>
}

export interface ForgePullDetail extends ForgePull {
  stat?: ForgeDiffStat
  commitCount?: number
  comments: ForgeComment[]
}

/** A single pull/merge request waiting in a merge queue (GitHub) or merge train (GitLab). */
export interface ForgeMergeQueueEntry {
  /** 1-based position in the queue/train. */
  position: number
  number?: number
  title: string
  author?: ForgeUser
  /** Provider status of this entry (e.g. 'QUEUED', 'MERGEABLE', 'idle', 'stale'). */
  status?: string
  enqueuedAt?: string | null
  url?: string | null
  /** Opaque provider handle so the UI can deep-link into the in-app PR view. */
  ref?: Record<string, unknown>
}

export interface ForgeMergeQueueStats {
  /** Target branch the queue/train is merging into. */
  branch: string
  /** 'queue' = GitHub merge queue, 'train' = GitLab merge train. */
  kind: 'queue' | 'train'
  entries: ForgeMergeQueueEntry[]
}

/** A single inline review comment anchored to a line in the diff. */
export interface ForgeReviewComment {
  path: string
  /** 1-based line in the new file (the RIGHT side of the diff). */
  line: number
  /** Start line for a multi-line comment/suggestion. */
  startLine?: number
  body: string
}

export interface ForgeReviewInput {
  event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT'
  body?: string
  comments?: ForgeReviewComment[]
}

export type ForgeMergeMethod = 'merge' | 'squash' | 'rebase'

export interface ForgeMergeResult {
  merged: boolean
  message?: string
}

export interface ForgeDiscussion {
  provider: ForgeId
  id: string
  number?: number
  title: string
  category?: string | null
  author?: ForgeUser
  body?: string | null
  commentCount?: number
  createdAt?: string | null
  url?: string | null
  answered?: boolean
  /** Owning repo (populated in search results). */
  repo?: { provider: ForgeId, owner: string, name: string, fullName: string, url?: string }
  ref?: Record<string, unknown>
}

export interface ForgeDiscussionDetail extends ForgeDiscussion {
  comments: ForgeComment[]
}

export type ForgeRunStatus
  = | 'queued'
    | 'running'
    | 'success'
    | 'failure'
    | 'cancelled'
    | 'skipped'
    | 'timed_out'
    | 'pending'
    | 'unknown'

export interface ForgeActionStep {
  name: string
  status: ForgeRunStatus
  number?: number
}

export interface ForgeActionJob {
  id: string
  name: string
  status: ForgeRunStatus
  startedAt?: string | null
  completedAt?: string | null
  url?: string | null
  steps?: ForgeActionStep[]
  error?: string | null
}

export interface ForgeActionRun {
  provider: ForgeId
  id: string
  name: string
  status: ForgeRunStatus
  event?: string | null
  branch?: string | null
  commitSha?: string | null
  commitMessage?: string | null
  actor?: ForgeUser
  createdAt?: string | null
  updatedAt?: string | null
  url?: string | null
  jobs?: ForgeActionJob[]
  ref?: Record<string, unknown>
}

export type ForgeSearchSort = 'best' | 'stars' | 'updated' | 'created' | 'forks'
export interface ForgeSearchOptions extends ForgePageOptions {
  sort?: ForgeSearchSort
  order?: 'asc' | 'desc'
}

export interface ForgeSearchCode {
  provider: ForgeId
  repo: { owner: string, name: string, fullName: string, url?: string }
  path: string
  url?: string | null
  fragments?: string[]
}

export type ForgeNotificationKind
  = | 'issue'
    | 'pull'
    | 'discussion'
    | 'commit'
    | 'release'
    | 'mention'
    | 'ci'
    | 'other'

export interface ForgeNotification {
  provider: ForgeId
  id: string
  kind: ForgeNotificationKind
  title: string
  reason?: string | null
  unread: boolean
  updatedAt?: string | null
  /** Repo the notification belongs to. */
  repo?: { owner: string, name: string, fullName: string }
  /** In-app route when we can resolve one, else external url. */
  to?: string | null
  url?: string | null
}

/**
 * A notification enriched into an actionable inbox item: the underlying PR/issue
 * has been resolved (state, author, diff stat, unread comments) so the inbox can
 * render a self-contained card and filter out already-closed/merged pings.
 */
export interface ForgeInboxItem {
  provider: ForgeId
  /** Notification thread id (used to mark the thread read). */
  id: string
  kind: ForgeNotificationKind
  title: string
  reason?: string | null
  unread: boolean
  updatedAt?: string | null
  repo?: { owner: string, name: string, fullName: string }
  /** In-app route to the PR/issue. */
  to?: string | null
  /** External url. */
  url?: string | null
  /** PR/issue number, when the subject has one. */
  number?: number
  /** Subject state (merged/closed items are surfaced separately, not dropped). */
  state?: ForgePullState
  /** True when the underlying PR/issue is already closed or merged. */
  resolved?: boolean
  author?: ForgeUser | null
  stat?: ForgeDiffStat | null
  /** True when the PR was opened by a dependency bot (dependabot/renovate). */
  isBot?: boolean
  botKind?: 'dependabot' | 'renovate' | null
  /** Recent comments created after the viewer last read the thread. */
  unreadComments?: ForgeComment[]
}

export type ForgeEventKind
  = | 'push'
    | 'pr_opened'
    | 'pr_merged'
    | 'pr_review'
    | 'issue_opened'
    | 'issue_closed'
    | 'comment'
    | 'create'
    | 'release'
    | 'fork'
    | 'star'
    | 'other'

/** A normalized activity event (GitHub events API, Tangled timeline, ...). */
export interface ForgeContribution {
  provider: ForgeId
  id: string
  kind: ForgeEventKind
  actor: ForgeUser
  repo: { owner: string, name: string, fullName: string, url?: string }
  /** PR/issue title, commit summary, tag name, ... */
  title?: string | null
  /** Deep link to the PR/issue/commit/release. */
  url?: string | null
  createdAt: string
  /** Human number when there is one (PR/issue). */
  number?: number
  /** e.g. number of commits in a push. */
  count?: number
  /** create-event ref type (branch/tag/repository). */
  refType?: string
  /** Ranking score used by the "friends" feed (higher = more impactful). */
  impact?: number
}

/** The signed-in viewer's actionable work, used by the home dashboard. */
export interface ForgeMyWork {
  /** Open pull/merge requests the viewer authored. */
  authoredPulls: ForgeIssue[]
  /** Open pull/merge requests awaiting the viewer's review. */
  reviewRequests: ForgeIssue[]
  /** Open issues assigned to the viewer. */
  assignedIssues: ForgeIssue[]
}

export interface ForgeCapabilities {
  /** Browse repos, tree, blobs, commits. */
  code: boolean
  issues: boolean
  pulls: boolean
  discussions: boolean
  actions: boolean
  repoSearch: boolean
  issueSearch: boolean
  codeSearch: boolean
  userSearch: boolean
  discussionSearch: boolean
  /** The signed-in viewer can star/unstar repositories. */
  star: boolean
  /** Repository supports a merge queue (GitHub) or merge train (GitLab). */
  mergeQueue: boolean
}

export const NO_CAPABILITIES: ForgeCapabilities = {
  code: false,
  issues: false,
  pulls: false,
  discussions: false,
  actions: false,
  repoSearch: false,
  issueSearch: false,
  codeSearch: false,
  userSearch: false,
  discussionSearch: false,
  star: false,
  mergeQueue: false
}

export interface IssueListOptions extends ForgePageOptions {
  state?: ForgeIssueState | 'all'
}

export interface PullListOptions extends ForgePageOptions {
  state?: ForgePullState | 'all'
}

export interface ForgeProvider {
  id: ForgeId
  label: string
  /** Icon name understood by Nuxt UI / Iconify (e.g. 'i-simple-icons-github'). */
  icon: string
  /** Brand color (hex) for badges/accents. */
  color?: string
  /** Label for the first URL segment, e.g. "Organization" or "Handle". */
  ownerLabel: string
  ownerPlaceholder: string
  repoPlaceholder: string
  capabilities: ForgeCapabilities
  /** Canonical web URL for an owner/repo pair on this forge. */
  webUrl: (owner: string, repo: string) => string
  /** Canonical web URL for an owner/profile on this forge. */
  ownerWebUrl?: (owner: string) => string

  // Repo browsing --------------------------------------------------------
  /** Fetch repo metadata + root tree + README in one call. */
  getOverview: (owner: string, repo: string, opts?: ForgeReadOptions) => Promise<RepoOverview>
  /** Fetch just the repo metadata (cheap-ish; used by detail pages). */
  getRepo?: (owner: string, repo: string, opts?: ForgeReadOptions) => Promise<ForgeRepo>
  /** List an owner's repositories. */
  listRepos?: (owner: string, opts?: ForgeReadOptions) => Promise<ForgeRepo[]>
  listBranches?: (repo: RepoLocator, opts?: ForgeReadOptions) => Promise<ForgeBranch[]>
  getTree?: (repo: RepoLocator, ref: string, path: string, opts?: ForgeReadOptions) => Promise<ForgeTreeEntry[]>
  getBlob?: (repo: RepoLocator, ref: string, path: string, opts?: ForgeReadOptions) => Promise<ForgeBlob>
  listCommits?: (repo: RepoLocator, ref: string, opts?: ForgePageOptions) => Promise<Paginated<ForgeCommit>>
  getCommit?: (repo: RepoLocator, sha: string, opts?: ForgeReadOptions) => Promise<ForgeCommitDetail>

  // Issues ---------------------------------------------------------------
  listIssues?: (repo: RepoLocator, opts?: IssueListOptions) => Promise<Paginated<ForgeIssue>>
  getIssue?: (repo: RepoLocator, id: string, opts?: ForgeReadOptions) => Promise<ForgeIssueDetail>

  // Pull requests --------------------------------------------------------
  listPulls?: (repo: RepoLocator, opts?: PullListOptions) => Promise<Paginated<ForgePull>>
  getPull?: (repo: RepoLocator, id: string, opts?: ForgeReadOptions) => Promise<ForgePullDetail>
  getPullFiles?: (repo: RepoLocator, id: string, opts?: ForgeReadOptions) => Promise<ForgeFileDiff[]>
  getPullCommits?: (repo: RepoLocator, id: string, opts?: ForgeReadOptions) => Promise<ForgeCommit[]>
  /** Merge queue (GitHub) / merge train (GitLab) state for a branch (default branch if omitted). */
  getMergeQueue?: (repo: RepoLocator, branch?: string, opts?: ForgeReadOptions) => Promise<ForgeMergeQueueStats | null>

  // Discussions ----------------------------------------------------------
  listDiscussions?: (repo: RepoLocator, opts?: ForgePageOptions) => Promise<Paginated<ForgeDiscussion>>
  getDiscussion?: (repo: RepoLocator, id: string, opts?: ForgeReadOptions) => Promise<ForgeDiscussionDetail>

  // Actions / CI ---------------------------------------------------------
  listActionRuns?: (repo: RepoLocator, opts?: ForgePageOptions) => Promise<Paginated<ForgeActionRun>>
  getActionRun?: (repo: RepoLocator, id: string, opts?: ForgeReadOptions) => Promise<ForgeActionRun>

  // Search ---------------------------------------------------------------
  searchRepos?: (q: string, opts?: ForgeSearchOptions) => Promise<Paginated<ForgeRepo>>
  searchIssues?: (q: string, opts?: ForgeSearchOptions) => Promise<Paginated<ForgeIssue>>
  searchCode?: (q: string, opts?: ForgeSearchOptions) => Promise<Paginated<ForgeSearchCode>>
  searchUsers?: (q: string, opts?: ForgeSearchOptions) => Promise<Paginated<ForgeUser>>
  searchDiscussions?: (q: string, opts?: ForgeSearchOptions) => Promise<Paginated<ForgeDiscussion>>

  // Notifications --------------------------------------------------------
  /** Authenticated notification inbox (requires a forge token). */
  listNotifications?: (opts?: ForgePageOptions) => Promise<ForgeNotification[]>
  /**
   * Enriched, actionable inbox: notifications with their PR/issue resolved
   * (state, author, diff stat, unread comments) and already-resolved pings
   * filtered out. Requires a forge token.
   */
  listInbox?: (opts?: ForgePageOptions) => Promise<ForgeInboxItem[]>
  /** Mark a single notification thread as read. */
  markNotificationRead?: (threadId: string, opts?: ForgeReadOptions) => Promise<void>

  // Write actions (require an authenticated token) -----------------------
  /** Post a top-level comment on an issue or pull request. */
  createComment?: (repo: RepoLocator, id: string, body: string, opts?: ForgeReadOptions) => Promise<ForgeComment>
  /** Submit a pull-request review (approve / request changes / comment), optionally with inline comments. */
  createReview?: (repo: RepoLocator, id: string, input: ForgeReviewInput, opts?: ForgeReadOptions) => Promise<void>
  /** Merge a pull request. Falls back across merge methods the repo allows. */
  mergePull?: (repo: RepoLocator, id: string, opts?: ForgeReadOptions & { method?: ForgeMergeMethod }) => Promise<ForgeMergeResult>
  /** Whether the authenticated viewer has starred this repository. */
  isStarred?: (repo: RepoLocator, opts?: ForgeReadOptions) => Promise<boolean>
  /** Star or unstar a repository; returns the resulting state and star count when known. */
  setStar?: (repo: RepoLocator, starred: boolean, opts?: ForgeReadOptions) => Promise<{ starred: boolean, stars?: number }>

  // Social graph ---------------------------------------------------------
  /**
   * Repositories from the accounts (users/orgs) the authenticated viewer
   * follows on this forge. Requires auth; returns [] when unavailable.
   */
  listFollowedRepos?: (opts?: ForgeReadOptions) => Promise<ForgeRepo[]>
  /** People (users, not orgs) the authenticated viewer follows. */
  listFollowing?: (opts?: ForgePageOptions) => Promise<ForgeUser[]>

  // Activity -------------------------------------------------------------
  /** Recent public activity for a user, newest first (bounded by the forge). */
  listUserEvents?: (login: string, opts?: ForgePageOptions) => Promise<ForgeContribution[]>

  /**
   * The signed-in viewer's actionable work on this forge: pull/merge requests
   * they authored, ones awaiting their review, and issues assigned to them.
   * Powers the home dashboard. Requires a forge token.
   */
  listMyWork?: (opts?: ForgeReadOptions) => Promise<ForgeMyWork>
}
