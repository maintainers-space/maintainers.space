export function formatCompactNumber(value?: number | null): string {
  if (value === null || value === undefined) return '0'
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(
    value
  )
}

export function formatBytes(bytes?: number): string {
  if (!bytes || bytes < 0) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let n = bytes
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

export function formatRelativeTime(input?: string | number | Date | null): string {
  if (!input) return ''
  const date = new Date(input)
  if (Number.isNaN(date.getTime())) return ''
  const diff = date.getTime() - Date.now()
  const abs = Math.abs(diff)
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31536000000],
    ['month', 2592000000],
    ['week', 604800000],
    ['day', 86400000],
    ['hour', 3600000],
    ['minute', 60000],
    ['second', 1000]
  ]
  for (const [unit, ms] of units) {
    if (abs >= ms || unit === 'second') return rtf.format(Math.round(diff / ms), unit)
  }
  return ''
}

export function formatDuration(startedAt?: string | null, completedAt?: string | null): string {
  if (!startedAt || !completedAt) return ''
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime()
  if (!Number.isFinite(ms) || ms < 0) return ''
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rem = seconds % 60
  if (minutes < 60) return rem ? `${minutes}m ${rem}s` : `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

export function formatDate(input?: string | number | Date | null): string {
  if (!input) return ''
  const date = new Date(input)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(date)
}

/** Shorten a DID for display, e.g. did:plc:wshs7t2adsemcrrd4snkeqli → did:plc:wshs…eqli */
export function shortDid(did?: string | null): string {
  if (!did) return ''
  if (!did.startsWith('did:')) return did
  const rest = did.slice(did.indexOf(':', 4) + 1)
  const prefix = did.slice(0, did.indexOf(':', 4) + 1)
  if (rest.length <= 12) return did
  return `${prefix}${rest.slice(0, 4)}…${rest.slice(-4)}`
}

/** Best display label for a forge user reference. */
export function userLabel(user?: { login?: string; displayName?: string | null } | null): string {
  if (!user) return ''
  if (user.displayName) return user.displayName
  const login = user.login ?? ''
  return login.startsWith('did:') ? shortDid(login) : login
}

const seg = (s: string): string => encodeURIComponent(s)

/** Encode a slash-delimited path, preserving separators. */
export function encodePathSegments(path: string): string {
  return path.split('/').filter(Boolean).map(encodeURIComponent).join('/')
}

/** Canonical in-app path for a repository. */
export function repoPath(loc: { provider: string; owner: string; name: string }, sub = ''): string {
  const base = `/${loc.provider}/${seg(loc.owner)}/${seg(loc.name)}`
  return sub ? `${base}/${sub.replace(/^\//, '')}` : base
}

/** Canonical in-app path for a user/org profile. */
export function userPath(user: { provider: string; login: string }): string {
  return `/${user.provider}/${seg(user.login)}`
}

/** GitLab calls them "merge requests" — every other forge says "pull requests". Same route, different word. */
export function pullsTerm(
  provider: string,
  opts: { plural?: boolean; capitalize?: boolean } = {}
): string {
  const word = provider === 'gitlab' ? 'merge request' : 'pull request'
  const withPlural = opts.plural ? `${word}s` : word
  return opts.capitalize ? withPlural.charAt(0).toUpperCase() + withPlural.slice(1) : withPlural
}

/** Canonical in-app path for an issue or pull request. */
export function issuePath(issue: {
  provider: string
  id: string
  isPull?: boolean
  repo?: { owner: string; name: string } | null
}): string {
  if (!issue.repo) return '#'
  const kind = issue.isPull ? 'pulls' : 'issues'
  return `/${issue.provider}/${seg(issue.repo.owner)}/${seg(issue.repo.name)}/${kind}/${seg(issue.id)}`
}

/** Lucide icon per pull-request state — shared by StateBadge and the pulls list. */
export const PULL_STATE_ICON: Record<string, string> = {
  open: 'i-lucide-git-pull-request',
  closed: 'i-lucide-git-pull-request-closed',
  merged: 'i-lucide-git-merge',
  draft: 'i-lucide-git-pull-request-draft'
}

/**
 * Tailwind Typography classes shared by every rendered-markdown surface. Code
 * blocks and inline code use theme tokens (not typography's dark-only defaults)
 * so they read correctly in both light and dark mode.
 */
export const PROSE_CLASSES = [
  'prose prose-sm max-w-none dark:prose-invert',
  'prose-pre:bg-muted prose-pre:text-highlighted prose-pre:border prose-pre:border-default',
  'prose-code:text-highlighted'
].join(' ')
