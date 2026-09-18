import type { ForgePull } from '~/types/forge'

/**
 * Dependency-update aggregation for the "dependencies" management page.
 *
 * Renovate and Dependabot both open one PR per dependency (or per configured
 * group) in every repo they watch, and neither surfaces a stable machine
 * parseable identifier for "this PR updates X to Y" yet. So we derive the
 * *meaning* of a dep PR from its title, which both tools shape predictably:
 *
 *   Dependabot:  "Bump astro from 7.3.2 to 7.3.3"
 *                "build(deps): bump astro from 7.3.2 to 7.3.3"
 *   Renovate:    "Update dependency astro to v7.3.3"
 *                "fix(deps): update dependency astro to v7"
 *
 * A PR is grouped by (bot, dependency, target-version, source-major). The source
 * *minor/patch* is ignored so "astro 7.3.1 -> 7.3.3" and "astro 7.3.2 -> 7.3.3" in
 * different repos collapse into one update (same source major), while a repo that
 * was at "astro 5.4.2 -> 7.3.3" stays in its own group because that source major
 * differs. PRs we can't reduce to a
 * single dependency+target (multi-dependency groups like Renovate's
 * "update all non-major dependencies", onboarding PRs, digest pinning) are
 * *not* merged across repos -- each stays an unparsable group of one, because
 * pretending two repos' broad groups are "the same update" is exactly the
 * false aggregation we want to avoid.
 */

export type DependencyBot = 'dependabot' | 'renovate'

/** A dep PR reduced to a single, groupable dependency update. */
export interface ParsedUpdate {
  bot: DependencyBot
  dependency: string
  /** Lowercased dependency name, for cross-repo grouping keys. */
  depKey: string
  to: string
  from?: string
  key: string
}

/** One dependency-bot pull request in one repo, ready to aggregate. */
export interface DependencyPr {
  pull: ForgePull
  repo: { provider: string; owner: string; name: string; fullName: string; url?: string | null }
  bot: DependencyBot
  parsed: ParsedUpdate | null
}

/** A group of PRs sharing the same meaning (or a lone unparsable PR). */
export interface DependencyGroup {
  key: string
  name: string
  items: DependencyPr[]
  unparsable: boolean
}

// ---- bot detection -----------------------------------------------------

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

/**
 * A separate automation marker in the PR body or labels, used only when the
 * author is a plain (human) account and the branch carries no bot prefix
 * (e.g. self-hosted Renovate running under a normal account). Never the title
 * alone, so a human PR that merely mentions "update dependency" is not treated
 * as a bot.
 */
function markerBotOf(pull: ForgePull): DependencyBot | null {
  const text = `${pull.body ?? ''} ${(pull.labels ?? [])
    .map((l) => l.name)
    .join(' ')}`.toLowerCase()
  const renovate = /renovate/.test(text)
  const dependabot = /dependabot/.test(text)
  if (dependabot && !renovate) return 'dependabot'
  if (renovate && !dependabot) return 'renovate'
  return null
}

/** Classify a pull request as a Renovate/Dependabot dependency PR, if it is one. */
export function detectDependencyBot(pull: ForgePull): DependencyBot | null {
  return (
    loginBotKindOf(pull.author?.login) ?? branchBotKindOf(pull.sourceBranch) ?? markerBotOf(pull)
  )
}

// ---- meaning parsing ---------------------------------------------------

/**
 * Dependabot's single-dependency title. Accepts the conventional-commit
 * prefix it adds on repos that use conventional commits
 * (`build(deps): bump ...`), plus the plain `Bump ... from ... to ...` form.
 */
const DEPENDABOT_BUMP =
  /(?:\b(?:build|chore|ci|deps?|fix|refactor|style)(?:\([^)]*\))?:\s*)?bump\s+(.+?)\s+from\s+(.+?)\s+to\s+(.+)$/i

/** Renovate's single-dependency title, with or without a conventional prefix. */
const RENOVATE_UPDATE =
  /(?:\b(?:build|chore|ci|deps?|fix|refactor|style)(?:\([^)]*\))?:\s*)?update dependency\s+(.+?)\s+to\s+(.+)$/i

/** Normalize a version for display/grouping: lowercase, drop leading v, ^, ~, =, >, <, spaces. */
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

/** Reduce a dep PR to its single-dependency meaning when the title allows it, else null. */
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
    return {
      bot: 'dependabot',
      dependency,
      depKey,
      from,
      to,
      key: `${depKey}:${to}`
    }
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

/** Classify a pull request and attach its parsed meaning; returns null for non-dep PRs. */
export function toDependencyPr(pull: ForgePull, repo: DependencyPr['repo']): DependencyPr | null {
  const bot = detectDependencyBot(pull)
  if (!bot) return null
  const parsed = parseDependencyUpdate(pull.title, bot)
  // Renovate only states the target in its title; the source (current) version
  // lives in the PR body's "Package | Change" table (`current -> new`).
  if (parsed && bot === 'renovate' && parsed.from == null) parsed.from = fromVersionOf(pull.body)
  return { pull, repo, bot, parsed }
}

/** The source (current) version from a Renovate body's `` `old` -> `new` `` change cell. */
function fromVersionOf(body: string | null | undefined): string | undefined {
  const m = String(body ?? '').match(/`([^`]+)`\s*(?:→|->)\s*`([^`]+)`/)
  if (!m?.[1]) return undefined
  const from = normalizeVersion(m[1])
  return from || undefined
}

/** Leading integer (major) of a version, or undefined when none is given. */
function majorOf(version?: string): number | undefined {
  const m = String(version ?? '').match(/^\s*(\d+)/)
  return m ? Number(m[1]) : undefined
}

/** Collapse dependency PRs into meaning groups (see module docs for the rules). */
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
    // Parsed (shareable) groups first, ordered by dependency then target; then
    // unparsable singletons grouped together, newest updated repo first.
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
