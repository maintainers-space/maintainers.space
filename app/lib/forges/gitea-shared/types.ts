// Raw Gitea-family (Gitea/Forgejo) REST API response shapes. These model only
// the fields this file actually reads; Gitea is inconsistent about optionality
// (e.g. `login` vs `username`), so most fields are optional.

export interface GfUserResponse {
  login?: string
  username?: string
  full_name?: string | null
  fullname?: string | null
  avatar_url?: string | null
  html_url?: string | null
}

/** The nested git-level author/committer identity on a commit (name/email/date, no account info). */
export interface GfGitActor {
  name?: string
  email?: string
  date?: string
  timestamp?: string
}

/**
 * `mapCommitActor`'s first argument is sometimes the git-level actor
 * (`commit.author`, with name/email/date) and sometimes falls back to the
 * top-level account object (`author`, with login/avatar_url) depending on
 * which endpoint produced the commit. Merge both shapes so either can be
 * passed without a weak-type mismatch.
 */
export interface GfCommitActorRaw {
  name?: string
  email?: string
  date?: string
  timestamp?: string
  login?: string
  username?: string
  avatar_url?: string | null
  full_name?: string | null
  fullname?: string | null
  html_url?: string | null
}

export interface GfRepoResponse {
  owner?: GfUserResponse | null
  name?: string
  full_name?: string
  description?: string | null
  default_branch?: string
  html_url?: string
  website?: string | null
  language?: string | null
  topics?: string[]
  stars_count?: number
  forks_count?: number
  watchers_count?: number
  open_issues_count?: number
  private?: boolean
  fork?: boolean
  created_at?: string | null
  updated_at?: string | null
  has_issues?: boolean
  has_pull_requests?: boolean
}

export interface GfTopicsResponse {
  topics?: string[]
}

/** Minimal repo reference embedded in events/notifications/search results. */
export interface GfRepoRefResponse {
  owner?: GfUserResponse | null
  name?: string
  full_name?: string
  html_url?: string
}

/** A repo reference that may be embedded directly or nested under `repository`/`repo`. */
export interface GfRepoRefContainer extends GfRepoRefResponse {
  repository?: GfRepoRefResponse
  repo?: GfRepoRefResponse
}

export interface GfLabelResponse {
  name: string
  color?: string | null
  description?: string | null
}

export interface GfIssueResponse {
  number?: number
  index?: number
  title?: string
  state?: string
  user?: GfUserResponse | null
  body?: string | null
  comments?: number
  labels?: (GfLabelResponse | string)[]
  created_at?: string | null
  updated_at?: string | null
  closed_at?: string | null
  html_url?: string
  pull_request?: unknown
}

export interface GfPullResponse extends GfIssueResponse {
  merged_at?: string | null
  merged?: boolean
  draft?: boolean
  head?: { ref?: string }
  base?: { ref?: string }
  additions?: number
  deletions?: number
  changed_files?: number
  commits?: number
}

/** Issue/pull search results embed the owning repo. */
export interface GfSearchIssueResponse extends GfIssueResponse {
  repository?: GfRepoRefResponse
  repo?: GfRepoRefResponse
}

export interface GfCommentResponse {
  id?: number | string
  user?: GfUserResponse | null
  body?: string | null
  created_at?: string | null
  html_url?: string | null
}

export interface GfReactionResponse {
  content: string
  user?: GfUserResponse | null
}

export interface GfCommitResponse {
  sha?: string
  id?: string
  commit?: {
    message?: string
    author?: GfGitActor
    committer?: GfGitActor
  }
  message?: string
  author?: GfUserResponse | null
  committer?: GfUserResponse | null
  html_url?: string | null
  parents?: { sha?: string; id?: string }[]
}

/** The `/git/commits/{sha}` endpoint returns a commit plus diff stat/files. */
export interface GfGitCommitResponse extends GfCommitResponse {
  stats?: { additions?: number; deletions?: number; total?: number }
  files?: GfFileDiffResponse[]
}

export interface GfFileDiffResponse {
  previous_filename?: string
  filename?: string
  path?: string
  status?: string
  additions?: number
  deletions?: number
  changes?: number
  patch?: string | null
}

/** Contents API entry: a tree listing item, or a single file/blob when requesting a path directly. */
export interface GfContentResponse {
  name?: string
  path?: string
  type?: string
  size?: number
  sha?: string
  content?: string
}

export interface GfBranchResponse {
  name: string
  commit?: { id?: string; message?: string; timestamp?: string }
}

/** A single entry from the user activity feed (`/users/{login}/activities/feeds`). */
export interface GfActivityResponse {
  id?: number | string
  op_type?: string
  act_user?: GfUserResponse | null
  repo?: GfRepoRefResponse
  content?: string | null
  ref_name?: string | null
  created?: string
  created_at?: string
}

export interface GfNotificationResponse {
  id: number | string
  subject?: {
    type?: string
    title?: string
    url?: string
    html_url?: string
    state?: string
  }
  repository?: GfRepoRefResponse
  reason?: string | null
  unread?: boolean
  updated_at?: string
}

export interface GfSearchReposResponse {
  ok?: boolean
  data?: GfRepoResponse[]
}

export interface GfSearchUsersResponse {
  ok?: boolean
  data?: GfUserResponse[]
}

/** `GET /repos/{owner}/{repo}/actions/runs` — Gitea/Forgejo Actions run list. */
export interface GfActionRunResponse {
  id?: number
  title?: string
  workflow_id?: string
  index?: number
  trigger_user?: GfUserResponse | null
  pretty_ref?: string
  commit_sha?: string
  event?: string
  status?: string
  started?: string | null
  stopped?: string | null
  created?: string | null
  updated?: string | null
  html_url?: string
}

export interface GfActionRunListResponse {
  entries?: GfActionRunResponse[]
  total_count?: number
}

export interface GfActionRunJobStepResponse {
  number?: number
  name?: string
  status?: string
  started?: string | null
  stopped?: string | null
}

export interface GfActionRunJobResponse {
  id?: number
  name?: string
  status?: string
  steps?: GfActionRunJobStepResponse[]
}
