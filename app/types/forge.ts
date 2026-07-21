// Shared types for the multi-forge abstraction layer.
// A "forge" is any code host (GitHub, Tangled, GitLab, Gitea, Forgejo, ...).

export type ForgeId = 'github' | 'tangled' | (string & {})

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

// --- Commits & diffs -------------------------------------------------------

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

// --- Issues ----------------------------------------------------------------

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

// --- Pull requests ---------------------------------------------------------

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

// --- Discussions -----------------------------------------------------------

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

// --- Actions / CI ----------------------------------------------------------

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

// --- Search ----------------------------------------------------------------

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

// --- Notifications ---------------------------------------------------------

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

// --- Capabilities ----------------------------------------------------------

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
  discussionSearch: false
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

  // Social graph ---------------------------------------------------------
  /**
   * Repositories from the accounts (users/orgs) the authenticated viewer
   * follows on this forge. Requires auth; returns [] when unavailable.
   */
  listFollowedRepos?: (opts?: ForgeReadOptions) => Promise<ForgeRepo[]>
}
