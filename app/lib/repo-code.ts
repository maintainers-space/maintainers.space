// Builds the repository "code" landing-page payload (root tree + health files,
// i.e. README, LICENSE, CHANGELOG, …) in one place. The live landing page
// ([provider]/[owner]/[repo]/index.vue) and the offline prefetcher
// (useOfflineRepos) both run through this so they write and read the exact same
// shape under the `repo-code:<provider>:<owner>:<name>` cache key — a prefetched
// landing page is indistinguishable from one the user opened themselves.
import type { ForgeProvider, ForgeTreeEntry, RepoLocator } from '~/types/forge'
import type { HealthFile } from '~/components/forge/RepoHealthFiles.vue'

const HEALTH: Record<string, { order: number; label: string; icon: string }> = {
  readme: { order: 0, label: 'README', icon: 'i-lucide-book-open' },
  contributing: { order: 1, label: 'Contributing', icon: 'i-lucide-git-pull-request-arrow' },
  security: { order: 2, label: 'Security', icon: 'i-lucide-shield-check' },
  code_of_conduct: { order: 3, label: 'Code of conduct', icon: 'i-lucide-scale' },
  support: { order: 4, label: 'Support', icon: 'i-lucide-life-buoy' },
  license: { order: 5, label: 'License', icon: 'i-lucide-scroll-text' },
  changelog: { order: 6, label: 'Changelog', icon: 'i-lucide-history' }
}

function healthKey(fileName: string): string | null {
  const base = fileName
    .replace(/\.(md|markdown|mdown|rst|txt|adoc)$/i, '')
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  if (base === 'readme') return 'readme'
  if (base === 'contributing') return 'contributing'
  if (base === 'security') return 'security'
  if (base === 'code_of_conduct') return 'code_of_conduct'
  if (base === 'support' || base === 'governance') return 'support'
  if (base === 'license' || base === 'licence' || base === 'copying') return 'license'
  if (base === 'changelog' || base === 'changes' || base === 'history') return 'changelog'
  return null
}

/**
 * Root tree plus the repo's health/README files, on `ref` (usually the default
 * branch). Throws when the forge is unreachable so callers can fall back to a
 * cached or errored state — health files in `.github` are best-effort.
 */
export async function loadRepoCode(
  f: ForgeProvider,
  locator: RepoLocator,
  owner: string,
  repo: string,
  ref: string
): Promise<{ entries: ForgeTreeEntry[]; health: HealthFile[] }> {
  let entries: ForgeTreeEntry[]
  if (f.getTree) entries = await f.getTree(locator, ref, '')
  else entries = (await f.getOverview(owner, repo)).entries

  const candidates = [...entries]
  const dotgithub = entries.find((e) => e.type === 'dir' && e.name.toLowerCase() === '.github')
  if (dotgithub && f.getTree) {
    try {
      candidates.push(...(await f.getTree(locator, ref, dotgithub.path)))
    } catch {
      /* health files in .github are best-effort */
    }
  }

  const seen = new Set<string>()
  const health: HealthFile[] = []
  for (const e of candidates) {
    if (e.type !== 'file') continue
    const key = healthKey(e.name)
    if (!key || seen.has(key)) continue
    seen.add(key)
    health.push({
      key,
      label: HEALTH[key]!.label,
      icon: HEALTH[key]!.icon,
      name: e.name,
      path: e.path
    })
  }
  health.sort((a, b) => HEALTH[a.key]!.order - HEALTH[b.key]!.order)

  return { entries, health }
}
