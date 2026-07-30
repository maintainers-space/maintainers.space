// Raw GitHub REST/GraphQL API response shapes. These mirror only the fields
// actually read by mappers.ts — not exhaustive representations of GitHub's API.

export interface GhUserResponse {
  login?: string
  avatar_url?: string | null
  html_url?: string | null
  type?: string
}

export interface GhLabelResponse {
  name: string
  color?: string | null
  description?: string | null
}

export interface GhRepoResponse {
  owner?: GhUserResponse | null
  name: string
  full_name?: string
  description?: string | null
  default_branch?: string
  html_url: string
  homepage?: string | null
  language?: string | null
  topics?: string[]
  stargazers_count?: number
  forks_count?: number
  subscribers_count?: number
  watchers_count?: number
  open_issues_count?: number
  private?: boolean
  fork?: boolean
  license?: { spdx_id?: string | null } | null
  created_at?: string | null
  pushed_at?: string | null
  updated_at?: string | null
  has_issues?: boolean
  has_discussions?: boolean
}

export interface GhIssueResponse {
  number: number
  title: string
  state?: string
  user?: GhUserResponse | null
  body?: string | null
  comments?: number
  labels?: (string | GhLabelResponse)[]
  created_at?: string | null
  updated_at?: string | null
  closed_at?: string | null
  html_url?: string
  pull_request?: unknown
  /** Present on /search/issues results. */
  repository_url?: string
  reactions?: GhReactionsResponse
}

export interface GhPullResponse {
  number: number
  title: string
  state?: string
  merged_at?: string | null
  merged?: boolean
  draft?: boolean
  user?: GhUserResponse | null
  body?: string | null
  comments?: number
  labels?: { name: string; color?: string | null }[]
  head?: { ref?: string }
  base?: { ref?: string }
  created_at?: string | null
  updated_at?: string | null
  closed_at?: string | null
  html_url?: string
  additions?: number
  deletions?: number
  changed_files?: number
  commits?: number
  reactions?: GhReactionsResponse
}

export interface GhReactionsResponse {
  '+1'?: number
  '-1'?: number
  laugh?: number
  hooray?: number
  confused?: number
  heart?: number
  rocket?: number
  eyes?: number
}

export interface GhCommentResponse {
  id: number | string
  user?: GhUserResponse | null
  body?: string | null
  created_at?: string | null
  html_url?: string
  reactions?: GhReactionsResponse
}

export interface GhCommitGitActor {
  name?: string
  email?: string
  date?: string
}

export interface GhCommitResponse {
  sha: string
  commit?: {
    message?: string
    author?: GhCommitGitActor | null
    committer?: GhCommitGitActor | null
  }
  author?: GhUserResponse | null
  committer?: GhUserResponse | null
  html_url?: string
  parents?: { sha: string }[]
  stats?: { additions?: number; deletions?: number }
  files?: GhFileDiffResponse[]
}

export interface GhFileDiffResponse {
  previous_filename?: string
  filename: string
  status?: string
  additions?: number
  deletions?: number
  patch?: string | null
  changes?: number
}

export interface GhActionRunResponse {
  id: number | string
  name?: string
  display_title?: string
  run_number?: number
  status?: string | null
  conclusion?: string | null
  event?: string
  head_branch?: string
  head_sha?: string
  head_commit?: { message?: string } | null
  actor?: GhUserResponse | null
  created_at?: string | null
  updated_at?: string | null
  html_url?: string
}

export interface GhActionRunsListResponse {
  workflow_runs?: GhActionRunResponse[]
  total_count?: number
}

export interface GhActionJobResponse {
  id: number | string
  name: string
  status?: string | null
  conclusion?: string | null
  started_at?: string | null
  completed_at?: string | null
  html_url?: string
  steps?: {
    name: string
    number?: number
    status?: string | null
    conclusion?: string | null
    started_at?: string | null
    completed_at?: string | null
  }[]
}

export interface GhActionJobsListResponse {
  jobs?: GhActionJobResponse[]
}

/** Shape of a single entry returned by the repo-contents endpoint (file or dir listing). */
export interface GhTreeEntryResponse {
  name: string
  path: string
  type?: string
  size?: number
  sha?: string
  content?: string
  encoding?: string
}

export interface GhReadmeResponse {
  name: string
  content: string
}

export interface GhBranchResponse {
  name: string
  commit?: { sha?: string }
}

export interface GhMergeResultResponse {
  merged?: boolean
  message?: string
}

export interface GhEventActor {
  login?: string
  avatar_url?: string
}

export interface GhEventRepoRef {
  name?: string
}

export interface GhEventPushCommit {
  sha?: string
  message?: string
}

export interface GhEventPayload {
  size?: number
  commits?: GhEventPushCommit[]
  head?: string
  ref?: string
  ref_type?: string
  action?: string
  number?: number
  pull_request?: { merged?: boolean; title?: string; number?: number; html_url?: string }
  review?: { html_url?: string }
  issue?: { title?: string; number?: number; html_url?: string }
  comment?: { html_url?: string }
  release?: { name?: string; tag_name?: string; html_url?: string }
  forkee?: { html_url?: string }
}

/** A raw item from the GitHub events API (/users/:login/events). */
export interface GhEventResponse {
  id?: string | number
  type?: string
  actor?: GhEventActor
  repo?: GhEventRepoRef
  created_at?: string
  payload?: GhEventPayload
}

export interface GhNotificationResponse {
  id: string | number
  repository?: {
    owner?: { login?: string }
    name?: string
    full_name?: string
    html_url?: string
  }
  subject?: {
    type?: string
    title?: string
    url?: string
  }
  reason?: string
  unread?: boolean
  updated_at?: string
  last_read_at?: string | null
}

export interface GhSearchReposResponse {
  items?: GhRepoResponse[]
  total_count?: number
  incomplete_results?: boolean
}

export interface GhSearchIssuesResponse {
  items?: GhIssueResponse[]
  total_count?: number
  incomplete_results?: boolean
}

export interface GhSearchCodeItem {
  repository?: {
    owner?: GhUserResponse | null
    name?: string
    full_name?: string
    html_url?: string
  }
  path: string
  html_url?: string
  text_matches?: { fragment?: string }[]
}

export interface GhSearchCodeResponse {
  items?: GhSearchCodeItem[]
  total_count?: number
}

export interface GhSearchUsersResponse {
  items?: GhUserResponse[]
  total_count?: number
}

/** A GraphQL author/actor reference (discussions, merge queue entries). */
export interface GhGraphqlActor {
  login?: string
  avatarUrl?: string
  url?: string
}

export interface GhGraphqlReactionGroup {
  content: string
  viewerHasReacted?: boolean
  users?: { totalCount?: number }
}

export interface GhGraphqlDiscussionCommentNode {
  id: string
  body: string
  createdAt: string
  url: string
  author?: GhGraphqlActor | null
  /** Present on the single-discussion detail query (GitHub Discussions are exactly 2 levels deep). */
  replies?: { nodes?: GhGraphqlDiscussionCommentNode[] }
  reactionGroups?: GhGraphqlReactionGroup[]
}

/**
 * A discussion node from the GraphQL API. Serves the list, detail and search
 * queries, which each select a slightly different subset of these fields.
 */
export interface GhGraphqlDiscussionNode {
  /** GraphQL node id — present on the single-discussion detail query, needed to react to the root post. */
  id?: string
  number: number
  title: string
  createdAt: string
  updatedAt?: string
  url: string
  answerChosenAt?: string | null
  category?: { name?: string } | null
  comments?: { totalCount?: number; nodes?: GhGraphqlDiscussionCommentNode[] }
  author?: GhGraphqlActor | null
  /** Present on the single-discussion detail query. */
  body?: string
  reactionGroups?: GhGraphqlReactionGroup[]
  /** Present on the cross-repo discussion search query. */
  repository?: {
    name: string
    nameWithOwner: string
    url: string
    owner?: { login?: string }
  }
}

export interface GhGraphqlDiscussionListResponse {
  repository?: {
    discussions?: {
      totalCount?: number
      pageInfo?: { endCursor?: string; hasNextPage?: boolean }
      nodes?: GhGraphqlDiscussionNode[]
    }
  }
}

export interface GhGraphqlDiscussionDetailResponse {
  repository?: {
    discussion?: GhGraphqlDiscussionNode
  }
}

export interface GhGraphqlDiscussionSearchResponse {
  search?: {
    discussionCount?: number
    pageInfo?: { endCursor?: string; hasNextPage?: boolean }
    nodes?: (GhGraphqlDiscussionNode | null)[]
  }
}

export interface GhGraphqlPullRequestRef {
  number?: number
  title?: string
  url?: string
  author?: GhGraphqlActor | null
}

export interface GhGraphqlMergeQueueEntryNode {
  state?: string
  enqueuedAt?: string | null
  pullRequest?: GhGraphqlPullRequestRef
}

export interface GhGraphqlMergeQueueResponse {
  repository?: {
    mergeQueue?: {
      entries?: {
        nodes?: (GhGraphqlMergeQueueEntryNode | null)[]
      }
    } | null
  } | null
}
