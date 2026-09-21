import type {
  ForgeId,
  ForgeReadOptions,
  ForgePageOptions,
  Paginated,
  ForgeRepo,
  ForgeBranch,
  ForgeTreeEntry,
  ForgeBlob,
  ForgeCommit,
  ForgeCommitDetail,
  ForgeIssue,
  ForgeIssueDetail,
  ForgePull,
  ForgePullDetail,
  ForgeFileDiff,
  ForgePullReview,
  ForgePullReviewComment,
  ForgeMergeQueueStats,
  ForgeDiscussion,
  ForgeDiscussionDetail,
  ForgeActionRun,
  ForgeJobLog,
  ForgeSearchOptions,
  ForgeSearchCode,
  ForgeUser,
  ForgeNotification,
  ForgeInboxItem,
  ForgeComment,
  ForgeReviewInput,
  ForgeReactionTarget,
  ForgeReactionKind,
  ForgeMergeMethod,
  ForgeMergeResult,
  ForgeContribution,
  ForgeMyWork,
  RepoLocator,
  RepoOverview,
  ForgeIssueState,
  ForgePullState
} from './forge'

export interface IssueListOptions extends ForgePageOptions {
  state?: ForgeIssueState | 'all'
}

export interface PullListOptions extends ForgePageOptions {
  state?: ForgePullState | 'all'
}

export interface RepoReader {
  getOverview(owner: string, repo: string, opts?: ForgeReadOptions): Promise<RepoOverview>
  getRepo(owner: string, repo: string, opts?: ForgeReadOptions): Promise<ForgeRepo>
  listRepos(owner: string, opts?: ForgeReadOptions): Promise<ForgeRepo[]>
  listAccessibleRepos(opts?: ForgeReadOptions): Promise<ForgeRepo[]>
  listFollowedRepos(opts?: ForgeReadOptions): Promise<ForgeRepo[]>
}

export interface CodeReader {
  listBranches(repo: RepoLocator, opts?: ForgeReadOptions): Promise<ForgeBranch[]>
  getTree(
    repo: RepoLocator,
    ref: string,
    path: string,
    opts?: ForgeReadOptions
  ): Promise<ForgeTreeEntry[]>
  getBlob(repo: RepoLocator, ref: string, path: string, opts?: ForgeReadOptions): Promise<ForgeBlob>
}

export interface CommitReader {
  listCommits(
    repo: RepoLocator,
    ref: string,
    opts?: ForgePageOptions
  ): Promise<Paginated<ForgeCommit>>
  getCommit(repo: RepoLocator, sha: string, opts?: ForgeReadOptions): Promise<ForgeCommitDetail>
}

export interface IssueReader {
  listIssues(repo: RepoLocator, opts?: IssueListOptions): Promise<Paginated<ForgeIssue>>
  getIssue(repo: RepoLocator, id: string, opts?: ForgeReadOptions): Promise<ForgeIssueDetail>
}

export interface PullReader {
  listPulls(repo: RepoLocator, opts?: PullListOptions): Promise<Paginated<ForgePull>>
  getPull(repo: RepoLocator, id: string, opts?: ForgeReadOptions): Promise<ForgePullDetail>
  getPullFiles(repo: RepoLocator, id: string, opts?: ForgeReadOptions): Promise<ForgeFileDiff[]>
  getPullCommits(repo: RepoLocator, id: string, opts?: ForgeReadOptions): Promise<ForgeCommit[]>
  listPullReviews(
    repo: RepoLocator,
    id: string,
    opts?: ForgePageOptions
  ): Promise<Paginated<ForgePullReview>>
  listPullReviewComments(
    repo: RepoLocator,
    id: string,
    reviewId: string,
    opts?: ForgePageOptions
  ): Promise<Paginated<ForgePullReviewComment>>
  getMergeQueue(
    repo: RepoLocator,
    branch?: string,
    opts?: ForgeReadOptions
  ): Promise<ForgeMergeQueueStats | null>
}

export interface DiscussionReader {
  listDiscussions(repo: RepoLocator, opts?: ForgePageOptions): Promise<Paginated<ForgeDiscussion>>
  getDiscussion(
    repo: RepoLocator,
    id: string,
    opts?: ForgeReadOptions
  ): Promise<ForgeDiscussionDetail>
}

export interface ActionReader {
  listActionRuns(repo: RepoLocator, opts?: ForgePageOptions): Promise<Paginated<ForgeActionRun>>
  getActionRun(repo: RepoLocator, id: string, opts?: ForgeReadOptions): Promise<ForgeActionRun>
  getActionJobLog(
    repo: RepoLocator,
    jobId: string,
    opts?: ForgeReadOptions
  ): Promise<ForgeJobLog | null>
}

export interface Searcher {
  searchRepos(q: string, opts?: ForgeSearchOptions): Promise<Paginated<ForgeRepo>>
  searchIssues(q: string, opts?: ForgeSearchOptions): Promise<Paginated<ForgeIssue>>
  searchCode(q: string, opts?: ForgeSearchOptions): Promise<Paginated<ForgeSearchCode>>
  searchUsers(q: string, opts?: ForgeSearchOptions): Promise<Paginated<ForgeUser>>
  searchDiscussions(q: string, opts?: ForgeSearchOptions): Promise<Paginated<ForgeDiscussion>>
}

export interface NotificationReader {
  listNotifications(opts?: ForgePageOptions): Promise<ForgeNotification[]>
  listInbox(opts?: ForgePageOptions): Promise<ForgeInboxItem[]>
  markNotificationRead(threadId: string, opts?: ForgeReadOptions): Promise<void>
}

export interface Writer {
  createComment(
    repo: RepoLocator,
    id: string,
    body: string,
    opts?: ForgeReadOptions
  ): Promise<ForgeComment>
  createReview(
    repo: RepoLocator,
    id: string,
    input: ForgeReviewInput,
    opts?: ForgeReadOptions
  ): Promise<void>
  createPullReviewReply(
    repo: RepoLocator,
    id: string,
    commentId: string,
    body: string,
    opts?: ForgeReadOptions
  ): Promise<ForgePullReviewComment>
  addReaction(
    repo: RepoLocator,
    target: ForgeReactionTarget,
    kind: ForgeReactionKind,
    opts?: ForgeReadOptions
  ): Promise<void>
  removeReaction(
    repo: RepoLocator,
    target: ForgeReactionTarget,
    kind: ForgeReactionKind,
    opts?: ForgeReadOptions
  ): Promise<void>
  mergePull(
    repo: RepoLocator,
    id: string,
    opts?: ForgeReadOptions & { method?: ForgeMergeMethod; expectedHead?: string | null }
  ): Promise<ForgeMergeResult>
  setStar(
    repo: RepoLocator,
    starred: boolean,
    opts?: ForgeReadOptions
  ): Promise<{ starred: boolean; stars?: number }>
}

export interface ActivityReader {
  listUserEvents(login: string, opts?: ForgePageOptions): Promise<ForgeContribution[]>
  listMyWork(opts?: ForgeReadOptions): Promise<ForgeMyWork>
  isStarred(repo: RepoLocator, opts?: ForgeReadOptions): Promise<boolean>
  listFollowing(opts?: ForgePageOptions): Promise<ForgeUser[]>
}

export interface ForgeFeatureMatrix {
  repoRead?: Partial<RepoReader>
  codeRead?: Partial<CodeReader>
  commitRead?: Partial<CommitReader>
  issueRead?: Partial<IssueReader>
  pullRead?: Partial<PullReader>
  discussionRead?: Partial<DiscussionReader>
  actionRead?: Partial<ActionReader>
  search?: Partial<Searcher>
  notificationRead?: Partial<NotificationReader>
  write?: Partial<Writer>
  activityRead?: Partial<ActivityReader>
}

export interface ForgeProvider {
  id: ForgeId
  label: string
  /** Icon name understood by Nuxt UI / Iconify (e.g. 'i-simple-icons-github'). */
  icon: string
  /** Brand color (hex) for badges/accents. */
  color?: string
  /** Relative real-world prevalence of this forge (repo/user volume). */
  dominance?: number
  /** Label for the first URL segment, e.g. "Organization" or "Handle". */
  ownerLabel: string
  ownerPlaceholder: string
  repoPlaceholder: string
  /** Canonical web URL for an owner/repo pair on this forge. */
  webUrl: (owner: string, repo: string) => string
  /** Canonical web URL for an owner/profile on this forge. */
  ownerWebUrl?: (owner: string) => string

  features: ForgeFeatureMatrix
}
