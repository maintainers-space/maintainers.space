// Offline availability for repositories.
//
// The PWA shell already precaches the app itself; this makes individual repos
// viewable with zero connectivity. Every repo you open is tracked locally by
// useRepoVisits (never sent anywhere); the ones you return to most are fetched
// into the persisted cache (~/lib/cache → IndexedDB) so the landing page
// (README, file tree) and repo metadata open instantly and offline. Auto-kept
// repos are ranked by the same recency-decayed score the home "favourites" list
// uses and capped at a configurable `maxCount` (default 100); pinned repos are
// always kept offline and never pushed out by ranking.
//
// Prefetching only ever *adds* to the cache: it seeds a repo when it isn't
// stored yet and otherwise leaves the copy alone, so it never competes with the
// live page's own stale-while-revalidate freshness and never hammers the forge
// on a repo the user has already visited (whose data refreshes naturally).
import { getForge } from '~/lib/forges'
import { cacheExists, cached, invalidate, prefetch } from '~/lib/cache'
import { idbKeys } from '~/lib/idb-store'
import { loadRepoCode } from '~/lib/repo-code'
import { useRepoVisits } from './useRepoVisits'
import type { ForgeRepo } from '~/types/forge'

export const OFFLINE_DEFAULT_MAX_COUNT = 100
const MAX_COUNT_MIN = 10
const MAX_COUNT_MAX = 500

const SETTINGS_KEY = 'maintainers.space:offline-repos'

export interface RepoRef {
  provider: string
  owner: string
  name: string
}

export interface OfflineRepoSettings {
  /** Automatically keep frequently-visited repos available offline. */
  enabled: boolean
  /** Cap on how many repos auto-prefetching will keep, default 100. */
  maxCount: number
  /** Repos explicitly kept offline, never evicted. */
  pinned: RepoRef[]
}

const _enabled = ref<boolean>(true)
const _maxCount = ref<number>(OFFLINE_DEFAULT_MAX_COUNT)
const _pinned = ref<RepoRef[]>([])
const _running = ref<boolean>(false)
let _loaded = false

function clampMaxCount(n: number): number {
  return Math.min(MAX_COUNT_MAX, Math.max(MAX_COUNT_MIN, Math.round(n)))
}

function keyOf(r: RepoRef): string {
  return `${r.provider}/${r.owner}/${r.name}`
}

function isRef(r: unknown): r is RepoRef {
  if (typeof r !== 'object' || !r) return false
  const o = r as Record<string, unknown>
  return typeof o.provider === 'string' && typeof o.owner === 'string' && typeof o.name === 'string'
}

function load(): void {
  if (_loaded || !import.meta.client) return
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null')
    if (typeof raw?.enabled === 'boolean') _enabled.value = raw.enabled
    if (typeof raw?.maxCount === 'number') _maxCount.value = clampMaxCount(raw.maxCount)
    if (Array.isArray(raw?.pinned)) _pinned.value = raw.pinned.filter(isRef)
  } catch {
    /* keep defaults */
  }
  _loaded = true
}

function persist(): void {
  if (!import.meta.client) return
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({ enabled: _enabled.value, maxCount: _maxCount.value, pinned: _pinned.value })
  )
}

/** Crawl one repo's offline surface (metadata + landing page) into the cache. */
async function seedRepo(r: RepoRef, force = false): Promise<void> {
  const f = getForge(r.provider)
  if (!f || !r.owner || !r.name) return
  const metaKey = `repo-meta:${r.provider}:${r.owner}:${r.name}`
  const codeKey = `repo-code:${r.provider}:${r.owner}:${r.name}`
  const locator = { owner: r.owner, name: r.name }
  const repo = await cached(
    metaKey,
    (): Promise<ForgeRepo> => {
      if (f.getRepo) return f.getRepo(r.owner, r.name)
      return f.getOverview(r.owner, r.name).then((ov) => ov.repo)
    },
    { force }
  )
  if (!repo?.defaultBranch) return
  await prefetch(codeKey, () => loadRepoCode(f, locator, r.owner, r.name, repo.defaultBranch), {
    force
  })
}

export function useOfflineRepos() {
  load()

  /** Top candidates to keep offline: pinned set plus the highest-ranked visits. */
  function candidates(): RepoRef[] {
    const pinnedSet = new Set(_pinned.value.map(keyOf))
    const { favourites } = useRepoVisits()
    const autoCandidates = favourites.value
      .filter((v) => !pinnedSet.has(keyOf(v)))
      .slice(0, Math.max(0, _maxCount.value - pinnedSet.size))
    return [
      ..._pinned.value,
      ...autoCandidates.map((v) => ({ provider: v.provider, owner: v.owner, name: v.name }))
    ].filter((r) => r.provider && r.owner && r.name)
  }

  /** Seed every candidate (best-effort). No-op while already running or disabled. */
  async function auto(): Promise<void> {
    if (_running.value || !_enabled.value) return
    _running.value = true
    try {
      for (const r of candidates()) {
        try {
          await seedRepo(r)
        } catch {
          /* keep whatever is already cached; skip to the next repo */
        }
      }
    } finally {
      _running.value = false
    }
    await evictExcess()
  }

  function setEnabled(enabled: boolean): void {
    _enabled.value = enabled
    persist()
  }

  function setMaxCount(maxCount: number): void {
    _maxCount.value = clampMaxCount(maxCount)
    persist()
    void evictExcess()
  }

  /** Keep `repo` offline from now on and seed it immediately. */
  async function makeAvailable(repo: RepoRef): Promise<void> {
    if (!_pinned.value.some((p) => keyOf(p) === keyOf(repo))) {
      _pinned.value = [..._pinned.value, repo]
      persist()
    }
    await seedRepo(repo, true)
  }

  /** Stop keeping `repo` offline; existing cached data is left in place. */
  function makeUnavailable(repo: RepoRef): void {
    _pinned.value = _pinned.value.filter((p) => keyOf(p) !== keyOf(repo))
    persist()
  }

  async function isAvailable(repo: RepoRef): Promise<boolean> {
    return (
      (await cacheExists(`repo-meta:${repo.provider}:${repo.owner}:${repo.name}`)) &&
      (await cacheExists(`repo-code:${repo.provider}:${repo.owner}:${repo.name}`))
    )
  }

  const settings = computed<OfflineRepoSettings>(() => ({
    enabled: _enabled.value,
    maxCount: _maxCount.value,
    pinned: [..._pinned.value]
  }))

  return {
    settings,
    running: readonly(_running),
    candidates,
    auto,
    setEnabled,
    setMaxCount,
    makeAvailable,
    makeUnavailable,
    isAvailable
  }
}

/**
 * Enforce `maxCount`: auto-kept repos (not pinned) that would exceed the cap are
 * evicted from the cache so storage stays bounded; pinned repos are never
 * evicted.
 */
async function evictExcess(): Promise<void> {
  if (!import.meta.client) return
  const pinnedSet = new Set(_pinned.value.map(keyOf))
  const refs = new Set<string>()
  for (const key of await idbKeys('repo-')) {
    const kind = key.startsWith('repo-meta:')
      ? 'repo-meta'
      : key.startsWith('repo-code:')
        ? 'repo-code'
        : null
    if (kind) refs.add(key.slice(kind.length + 1))
  }
  const autoRefs = [...refs].filter((k) => !pinnedSet.has(k))
  let over = autoRefs.length - Math.max(0, _maxCount.value - pinnedSet.size)
  for (const k of autoRefs) {
    if (over <= 0) break
    invalidate(`repo-meta:${k}`)
    invalidate(`repo-code:${k}`)
    over--
  }
}
