export const REPO_METADATA_COLLECTION = 'dev.koinon.repoMetadata'

export interface CommunityLink {
  service: string
  url: string
  label?: string
}

export interface RepoMetadataRecord {
  $type?: string
  provider: string
  host?: string
  owner: string
  name: string
  /** Canonical repo URL used as the constellation backlink target. */
  subject: string
  links?: CommunityLink[]
  /** Owner-scoped JWS (ES256) issued by the koinon server; absent for Tangled. */
  attestation?: string
  /** Origin of the koinon server that issued `attestation`. */
  attestedBy?: string
  createdAt: string
}

export interface ServiceDef {
  key: string
  label: string
  icon: string
  hosts?: string[]
}

const GENERIC_SERVICE: ServiceDef = { key: 'website', label: 'Website', icon: 'i-lucide-globe' }

/** Known community platforms, ordered for the picker. `website` is the fallback. */
export const COMMUNITY_SERVICES: ServiceDef[] = [
  { key: 'discord', label: 'Discord', icon: 'i-simple-icons-discord', hosts: ['discord.gg', 'discord.com', 'discordapp.com'] },
  { key: 'slack', label: 'Slack', icon: 'i-simple-icons-slack', hosts: ['slack.com'] },
  { key: 'matrix', label: 'Matrix', icon: 'i-simple-icons-matrix', hosts: ['matrix.to', 'matrix.org'] },
  { key: 'element', label: 'Element', icon: 'i-simple-icons-element', hosts: ['element.io'] },
  { key: 'zulip', label: 'Zulip', icon: 'i-simple-icons-zulip', hosts: ['zulip.com', 'zulipchat.com'] },
  { key: 'telegram', label: 'Telegram', icon: 'i-simple-icons-telegram', hosts: ['t.me', 'telegram.me', 'telegram.org'] },
  { key: 'gitter', label: 'Gitter', icon: 'i-simple-icons-gitter', hosts: ['gitter.im'] },
  { key: 'revolt', label: 'Revolt', icon: 'i-simple-icons-revoltdotchat', hosts: ['revolt.chat'] },
  { key: 'guilded', label: 'Guilded', icon: 'i-simple-icons-guilded', hosts: ['guilded.gg'] },
  { key: 'signal', label: 'Signal', icon: 'i-simple-icons-signal', hosts: ['signal.group', 'signal.me'] },
  { key: 'discourse', label: 'Forum', icon: 'i-simple-icons-discourse' },
  { key: 'mastodon', label: 'Mastodon', icon: 'i-simple-icons-mastodon' },
  { key: 'bluesky', label: 'Bluesky', icon: 'i-simple-icons-bluesky', hosts: ['bsky.app', 'bsky.social'] },
  { key: 'reddit', label: 'Reddit', icon: 'i-simple-icons-reddit', hosts: ['reddit.com'] },
  GENERIC_SERVICE
]

const BY_KEY = new Map(COMMUNITY_SERVICES.map(s => [s.key, s]))

export function serviceDef(key: string): ServiceDef {
  return BY_KEY.get(key) ?? GENERIC_SERVICE
}

function hostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
}

/** Best-effort service key inferred from a URL host; `website` when unknown. */
export function detectService(url: string): string {
  const host = hostname(url)
  if (!host) return GENERIC_SERVICE.key
  for (const s of COMMUNITY_SERVICES) {
    if (s.hosts?.some(h => host === h || host.endsWith(`.${h}`))) return s.key
  }
  return GENERIC_SERVICE.key
}

/** Human label for a link: explicit label, else the service name, else its host. */
export function linkLabel(link: CommunityLink): string {
  if (link.label?.trim()) return link.label.trim()
  const def = BY_KEY.get(link.service)
  if (def && def !== GENERIC_SERVICE) return def.label
  return hostname(link.url) ?? def?.label ?? 'Link'
}

/**
 * Validate and normalise community links: keep http(s) only, trim, dedupe by
 * URL, and infer a service from the host when one isn't given.
 */
export function sanitizeLinks(links: unknown): CommunityLink[] {
  if (!Array.isArray(links)) return []
  const seen = new Set<string>()
  const out: CommunityLink[] = []
  for (const raw of links) {
    if (!raw || typeof raw !== 'object') continue
    const candidate = raw as Partial<CommunityLink>
    const url = typeof candidate.url === 'string' ? candidate.url.trim() : ''
    if (!/^https?:\/\//i.test(url)) continue
    const key = url.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const service = typeof candidate.service === 'string' && candidate.service ? candidate.service : detectService(url)
    const label = typeof candidate.label === 'string' ? candidate.label.trim() : ''
    out.push(label ? { service, url, label } : { service, url })
  }
  return out
}

function defaultRepoUrl(provider: string, owner: string, name: string): string {
  switch (provider) {
    case 'github': return `https://github.com/${owner}/${name}`
    case 'gitlab': return `https://gitlab.com/${owner}/${name}`
    case 'codeberg': return `https://codeberg.org/${owner}/${name}`
    case 'tangled': return `https://tangled.sh/@${owner.replace(/^@/, '')}/${name}`
    default: return `https://${provider}/${owner}/${name}`
  }
}

/**
 * Canonical, lowercase repo URL used as the constellation backlink target.
 * Derived from provider/owner/name so writers and readers always agree.
 */
export function repoSubject(provider: string, owner: string, name: string): string {
  const raw = defaultRepoUrl(provider, owner, name)
  try {
    const url = new URL(raw)
    const path = url.pathname.replace(/\.git$/i, '').replace(/\/+$/, '')
    return `${url.protocol}//${url.host}${path}`.toLowerCase()
  } catch {
    return raw.toLowerCase()
  }
}

function slug(part: string): string {
  return part.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/(^-+)|(-+$)/g, '').slice(0, 200)
}

/** Deterministic record key so claiming the same repo is idempotent. */
export function repoMetadataRkey(provider: string, owner: string, name: string, host?: string): string {
  const key = [slug(provider), host ? slug(host) : '', slug(owner), slug(name)].filter(Boolean).join('_')
  return key || 'repo'
}
