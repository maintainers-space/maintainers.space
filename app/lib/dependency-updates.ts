import type { ForgePull } from '~/types/forge'

export type DependencyBot = 'dependabot' | 'renovate'

export interface ParsedUpdate {
  bot: DependencyBot
  dependency: string
  depKey: string
  to: string
  from?: string
  key: string
}

export interface DependencyPr {
  pull: ForgePull
  repo: { provider: string; owner: string; name: string; fullName: string; url?: string | null }
  bot: DependencyBot
  parsed: ParsedUpdate | null
}

export interface DependencyGroup {
  key: string
  name: string
  items: DependencyPr[]
  unparsable: boolean
}

function loginBotKindOf(login?: string | null): DependencyBot | null {
  const l = String(login ?? '').toLowerCase()
  if (/^dependabot(-preview)?(\[bot\])?$|^app\/dependabot(\[bot\])?$/.test(l)) return 'dependabot'
  if (/^renovate(\[bot\])?$/.test(l)) return 'renovate'
  return null
}

function branchBotKindOf(branch?: string | null): DependencyBot | null {
  const b = String(branch ?? '').toLowerCase()
  if (b.startsWith('dependabot/') || b.startsWith('dependabot-')) return 'dependabot'
  if (b.startsWith('renovate/') || b.startsWith('renovate-')) return 'renovate'
  return null
}

function markerBotOf(pull: ForgePull): DependencyBot | null {
  const text =
    `${pull.body ?? ''} ${(pull.labels ?? []).map((l) => l.name).join(' ')}`.toLowerCase()
  const renovate = /renovate/.test(text)
  const dependabot = /dependabot/.test(text)
  if (dependabot && !renovate) return 'dependabot'
  if (renovate && !dependabot) return 'renovate'
  return null
}

export function detectDependencyBot(pull: ForgePull): DependencyBot | null {
  return (
    loginBotKindOf(pull.author?.login) ?? branchBotKindOf(pull.sourceBranch) ?? markerBotOf(pull)
  )
}

const DEPENDABOT_BUMP =
  /(?:\b(?:build|chore|ci|deps?|fix|refactor|style)(?:\([^)]*\))?:\s*)?bump\s+(.+?)\s+from\s+(.+?)\s+to\s+(.+?)(?:\s+in\s+\/.+)?$/i

const RENOVATE_UPDATE =
  /(?:\b(?:build|chore|ci|deps?|fix|refactor|style)(?:\([^)]*\))?:\s*)?update dependency\s+(.+?)\s+to\s+(.+)$/i

export function normalizeVersion(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/^[v^~=<>\s]+/, '')
}

export function normalizeDep(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
}

export function parseDependencyUpdate(
  title: string | null | undefined,
  bot: DependencyBot
): ParsedUpdate | null {
  const t = String(title ?? '').trim()
  if (!t) return null

  const dep = DEPENDABOT_BUMP.exec(t)
  if (dep && bot === 'dependabot') {
    const dependency = dep[1]!.trim()
    const from = normalizeVersion(dep[2]!)
    const to = normalizeVersion(dep[3]!)
    const depKey = normalizeDep(dependency)
    if (!depKey || !to) return null
    return { bot: 'dependabot', dependency, depKey, from, to, key: `${depKey}:${to}` }
  }

  const ren = RENOVATE_UPDATE.exec(t)
  if (ren && bot === 'renovate') {
    const dependency = ren[1]!.trim()
    const to = normalizeVersion(ren[2]!)
    const depKey = normalizeDep(dependency)
    if (!depKey || !to) return null
    return { bot: 'renovate', dependency, depKey, to, key: `${depKey}:${to}` }
  }

  return null
}

export function toDependencyPr(pull: ForgePull, repo: DependencyPr['repo']): DependencyPr | null {
  const bot = detectDependencyBot(pull)
  if (!bot) return null
  const parsed = parseDependencyUpdate(pull.title, bot)
  if (parsed && bot === 'renovate' && parsed.from == null) parsed.from = fromVersionOf(pull.body)
  return { pull, repo, bot, parsed }
}

function fromVersionOf(body: string | null | undefined): string | undefined {
  const m = String(body ?? '').match(/`([^`]+)`\s*(?:→|->)\s*`([^`]+)`/)
  if (!m?.[1]) return undefined
  const from = normalizeVersion(m[1])
  return from || undefined
}

function majorOf(version?: string): number | undefined {
  const m = String(version ?? '').match(/^\s*(\d+)/)
  return m ? Number(m[1]) : undefined
}

export function groupDependencyPrs(prs: DependencyPr[]): DependencyGroup[] {
  const groups = new Map<string, DependencyGroup>()
  for (const pr of prs) {
    const parsed = pr.parsed
    const key = parsed
      ? `${parsed.key}:source-${majorOf(parsed.from) ?? 'unknown'}`
      : `unparsed:${pr.repo.provider}:${pr.repo.fullName}:${pr.pull.number ?? pr.pull.id}`
    let g = groups.get(key)
    if (!g) {
      g = {
        key,
        name: parsed
          ? `Update ${parsed.dependency} to ${parsed.to}`
          : pr.pull.title || '(unclassified dependency update)',
        items: [],
        unparsable: !parsed
      }
      groups.set(key, g)
    }
    g.items.push(pr)
  }

  return [...groups.values()].sort((a, b) => {
    if (a.unparsable !== b.unparsable) return a.unparsable ? 1 : -1
    if (!a.unparsable) {
      const firstA = a.items[0]!.parsed!
      const firstB = b.items[0]!.parsed!
      return firstA.depKey.localeCompare(firstB.depKey) || firstA.to.localeCompare(firstB.to)
    }
    const ua = a.items[0]!.pull.updatedAt ?? ''
    const ub = b.items[0]!.pull.updatedAt ?? ''
    return ub.localeCompare(ua)
  })
}
