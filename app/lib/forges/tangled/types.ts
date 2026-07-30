// Raw Tangled (AT Protocol lexicon) record and Bobbin/Spindle response shapes.
// These model only the fields this file actually reads.

export interface TangledRepoValue {
  $type?: string
  name?: string
  knot?: string
  spindle?: string
  repoDid?: string
  description?: string
  website?: string
  topics?: string[]
  source?: string
  createdAt?: string
}

export interface TangledListItem {
  uri: string
  cid?: string
  value: TangledRepoValue
}

export interface ResolvedRepo {
  atUri: string
  repoDid?: string
  knot?: string
  spindle?: string
  value: TangledRepoValue
}

export interface TangledAuthorInfo {
  Name?: string
  Email?: string
  When?: string
}

// Commit records come back from two different Tangled endpoints with
// differently-cased fields (`sh.tangled.repo.log`/`diff` vs. the raw git
// plumbing used elsewhere), so both casings are optional here.
export interface TangledCommitRecord {
  this?: string
  SHA?: string
  message?: string
  Message?: string
  author?: TangledAuthorInfo
  Author?: TangledAuthorInfo
  parent?: string
}

export interface TangledDiffFileRecord {
  name?: { old?: string; new?: string }
  is_new?: boolean
  is_delete?: boolean
  is_rename?: boolean
  is_binary?: boolean
  text_fragments?: TangledFragment[]
}

export interface TangledDiffResponse {
  commit?: TangledCommitRecord
  stat?: { insertions?: number; deletions?: number; files_changed?: number }
  diff?: TangledDiffFileRecord[]
}

export interface TangledIssueValue {
  title?: string
  body?: string
  createdAt?: string
}

export interface TangledIssueRecord {
  uri: string
  value?: TangledIssueValue
  state?: string
  commentCount?: number
  stateUpdatedAt?: string
}

export interface TangledPullRef {
  branch?: string
  repoDid?: string
}

export interface TangledPullValue {
  title?: string
  body?: string
  createdAt?: string
  source?: TangledPullRef
  target?: TangledPullRef
}

export interface TangledPullRecord {
  uri: string
  value?: TangledPullValue
  state?: string
  status?: string
  commentCount?: number
  stateUpdatedAt?: string
}

// `sh.tangled.repo.compare` returns raw `git format-patch` entries (used for
// cross-branch, same-repo PR diffs), hence the PascalCase fields.
export interface TangledFormatPatchFile {
  OldName?: string
  NewName?: string
  IsNew?: boolean
  IsDelete?: boolean
  IsRename?: boolean
  IsBinary?: boolean
  TextFragments?: TangledFragment[]
}

export interface TangledFormatPatchEntry {
  SHA?: string
  Title?: string
  Body?: string
  Author?: { Name?: string; Email?: string }
  AuthorDate?: string
  Files?: TangledFormatPatchFile[]
}

export interface TangledCommentValue {
  body?: string
  createdAt?: string
}

export interface TangledCommentRecord {
  uri: string
  value?: TangledCommentValue
}

export interface TangledTree {
  ref?: string
  readme?: { filename?: string; contents?: string } | null
  files?: Array<{
    name: string
    mode: string
    size?: number
    last_commit?: { message?: string; when?: string; hash?: string }
  }>
}

export interface TangledFragmentLine {
  Op: number
  Line: string
}
export interface TangledFragment {
  OldPosition: number
  OldLines: number
  NewPosition: number
  NewLines: number
  Lines: TangledFragmentLine[]
}

export interface TangledPipeline {
  id: string
  repo?: string
  commit?: string
  createdAt?: string
  trigger?: { ref?: string }
  workflows?: Array<{
    id?: string
    name?: string
    status?: string
    startedAt?: string
    finishedAt?: string
    error?: string
  }>
}
