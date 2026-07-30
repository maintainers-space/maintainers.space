// Raw GitLab REST API v4 response shapes — only the fields this file actually
// reads. These are intentionally loose (most fields optional) since GitLab's
// real payloads carry many more fields than we use.

export interface GlUserResponse {
  id?: number
  username?: string
  name?: string | null
  avatar_url?: string | null
  web_url?: string | null
}

export interface GlNamespaceResponse {
  full_path?: string
  web_url?: string
  avatar_url?: string | null
}

export interface GlLicenseResponse {
  nickname?: string | null
  name?: string | null
}

export interface GlProjectResponse {
  id: number
  path: string
  path_with_namespace?: string
  description?: string | null
  default_branch?: string | null
  web_url: string
  namespace?: GlNamespaceResponse | null
  avatar_url?: string | null
  topics?: string[]
  tag_list?: string[]
  star_count?: number
  forks_count?: number
  open_issues_count?: number
  visibility?: string
  forked_from_project?: unknown
  license?: GlLicenseResponse | null
  created_at?: string | null
  last_activity_at?: string | null
  updated_at?: string | null
  issues_enabled?: boolean
  merge_requests_enabled?: boolean
}

/** Fields shared by merge-request-shaped payloads (MRs and MR-ish todo targets). */
export interface GlMrStateFields {
  state?: string
  merged_at?: string | null
  draft?: boolean
  work_in_progress?: boolean
}

export interface GlReferencesResponse {
  full?: string
}

export interface GlLabelResponse {
  name: string
  color?: string | null
  description?: string | null
}

export interface GlIssueResponse {
  iid: number
  title: string
  state?: string
  author?: GlUserResponse
  description?: string | null
  web_url?: string
  user_notes_count?: number
  labels?: (string | GlLabelResponse)[]
  created_at?: string | null
  updated_at?: string | null
  closed_at?: string | null
  references?: GlReferencesResponse
}

export interface GlMergeRequestResponse extends GlMrStateFields {
  iid: number
  title: string
  author?: GlUserResponse
  description?: string | null
  web_url?: string
  user_notes_count?: number
  labels?: (string | GlLabelResponse)[]
  source_branch?: string
  target_branch?: string
  created_at?: string | null
  updated_at?: string | null
  closed_at?: string | null
  changes_count?: string | number | null
  merge_error?: string | null
  references?: GlReferencesResponse
}

export interface GlNoteResponse {
  id: number
  author?: GlUserResponse
  body?: string
  created_at?: string | null
  system?: boolean
}

export interface GlAwardEmojiResponse {
  id: number
  name: string
  user?: { username?: string }
}

export interface GlCommitResponse {
  id: string
  short_id?: string
  message?: string
  title?: string
  author_name?: string
  author_email?: string
  authored_date?: string
  committer_name?: string
  committer_email?: string
  committed_date?: string
  created_at?: string
  web_url?: string
  parent_ids?: string[]
  stats?: { additions?: number; deletions?: number }
}

export interface GlDiffResponse {
  old_path?: string
  new_path?: string
  new_file?: boolean
  deleted_file?: boolean
  renamed_file?: boolean
  diff?: string
}

export interface GlPipelineResponse {
  id: number
  name?: string | null
  status?: string
  source?: string | null
  ref?: string | null
  sha?: string | null
  created_at?: string | null
  updated_at?: string | null
  web_url?: string
}

export interface GlJobResponse {
  id: number
  name: string
  status?: string
  started_at?: string | null
  finished_at?: string | null
  web_url?: string
}

export interface GlEventResponse {
  id: number
  project_id?: number
  created_at?: string | null
  action_name?: string
  action?: string
  target_type?: string | null
  target_title?: string | null
  target_iid?: number
  author?: { username?: string; name?: string; avatar_url?: string | null }
  author_username?: string
  push_data?: {
    commit_count?: number
    commit_title?: string | null
    ref?: string | null
  }
}

export interface GlTreeItemResponse {
  id?: string
  name: string
  path: string
  type?: string
}

export interface GlBranchResponse {
  name: string
  default?: boolean
  commit?: { id?: string }
}

export interface GlFileResponse {
  file_path?: string
  content?: string
  size?: number
}

export interface GlMergeRequestChangesResponse {
  changes?: GlDiffResponse[]
}

export interface GlMergeTrainCarResponse {
  target_branch?: string
  status?: string
  created_at?: string | null
  merge_request?: {
    iid?: number
    title?: string
    author?: GlUserResponse
    web_url?: string | null
  }
  user?: GlUserResponse
}

export interface GlBlobSearchResponse {
  project_id?: number
  path?: string
  filename?: string
  data?: string
}

export interface GlTodoTargetResponse extends GlMrStateFields {
  title?: string
  iid?: number
  author?: GlUserResponse
}

export interface GlTodoResponse {
  id: number
  action_name?: string
  target_type?: string
  target?: GlTodoTargetResponse
  body?: string
  state?: string
  updated_at?: string | null
  created_at?: string | null
  target_url?: string | null
  project?: {
    path_with_namespace?: string
    path?: string
    namespace?: { full_path?: string }
  }
}

export interface GlStarrerResponse {
  user?: { id?: number }
}
