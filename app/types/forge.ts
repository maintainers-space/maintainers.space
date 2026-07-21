// Shared types for the multi-forge abstraction layer.
// A "forge" is any code host (GitHub, Tangled, GitLab, Gitea, Forgejo, ...).

export type ForgeId = 'github' | 'tangled' | (string & {})

export interface ForgeReadOptions {
  /** Optional bearer token for authenticated forge APIs (e.g. GitHub PAT). */
  token?: string
  signal?: AbortSignal
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
  updatedAt?: string | null
  /** Provider-specific handles (AT-URI, knot, repoDid, ...) for follow-up calls. */
  ref?: Record<string, unknown>
}

export interface ForgeTreeEntry {
  name: string
  path: string
  type: 'file' | 'dir'
  size?: number
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

export interface RepoOverview {
  repo: ForgeRepo
  entries: ForgeTreeEntry[]
  readme: ForgeReadme | null
}

export interface ForgeProvider {
  id: ForgeId
  label: string
  /** Icon name understood by Nuxt UI / Iconify (e.g. 'i-simple-icons-github'). */
  icon: string
  /** Label for the first URL segment, e.g. "Organization" or "Handle". */
  ownerLabel: string
  ownerPlaceholder: string
  repoPlaceholder: string
  /** Canonical web URL for an owner/repo pair on this forge. */
  webUrl: (owner: string, repo: string) => string
  /** Fetch repo metadata + root tree + README in one call. */
  getOverview: (owner: string, repo: string, opts?: ForgeReadOptions) => Promise<RepoOverview>
  /** Optional: list an owner's repositories. */
  listRepos?: (owner: string, opts?: ForgeReadOptions) => Promise<ForgeRepo[]>
}
