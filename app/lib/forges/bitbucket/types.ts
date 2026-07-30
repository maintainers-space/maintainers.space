// Raw Bitbucket Cloud REST API v2.0 response shapes.
// These model only the fields this file actually reads.

export interface BbLinkResponse {
  href?: string
}

export interface BbLinksResponse {
  html?: BbLinkResponse
  self?: BbLinkResponse
  avatar?: BbLinkResponse
}

/** An account (user) reference — Bitbucket dropped stable usernames in 2019; nickname is the closest analog. */
export interface BbAccountResponse {
  uuid?: string
  account_id?: string
  display_name?: string | null
  nickname?: string | null
  links?: BbLinksResponse
}

export interface BbWorkspaceRefResponse {
  slug?: string
  name?: string
  links?: BbLinksResponse
}

export interface BbRepoResponse {
  name?: string
  slug?: string
  full_name?: string
  description?: string | null
  is_private?: boolean
  language?: string | null
  mainbranch?: { name?: string }
  workspace?: BbWorkspaceRefResponse
  website?: string | null
  created_on?: string | null
  updated_on?: string | null
  links?: BbLinksResponse
  parent?: unknown
}

export interface BbPageResponse<T> {
  values?: T[]
  next?: string
}

export interface BbCommitResponse {
  hash?: string
  message?: string
  author?: { raw?: string; user?: BbAccountResponse }
  date?: string
  parents?: { hash?: string }[]
  links?: BbLinksResponse
}

export interface BbBranchResponse {
  name?: string
  target?: { hash?: string }
}

export interface BbSrcEntryResponse {
  path?: string
  type?: string
  size?: number
}

export interface BbRepoRefResponse {
  full_name?: string
  links?: BbLinksResponse
}

export interface BbPrResponse {
  id?: number
  title?: string
  description?: string | null
  state?: string
  author?: BbAccountResponse
  source?: { branch?: { name?: string }; repository?: BbRepoRefResponse }
  destination?: { branch?: { name?: string }; repository?: BbRepoRefResponse }
  created_on?: string | null
  updated_on?: string | null
  comment_count?: number
  links?: BbLinksResponse
}

export interface BbDiffstatEntryResponse {
  status?: string
  old?: { path?: string } | null
  new?: { path?: string } | null
  lines_added?: number
  lines_removed?: number
}

export interface BbCommentResponse {
  id?: number
  user?: BbAccountResponse
  content?: { raw?: string }
  created_on?: string | null
  links?: BbLinksResponse
}

export interface BbWorkspaceResponse {
  slug?: string
}
