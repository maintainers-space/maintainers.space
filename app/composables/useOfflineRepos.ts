// Offline availability for repositories.
//
// The PWA shell already precaches the app itself; this makes individual repos
// viewable with zero connectivity. Every repo you open is tracked locally by
// useRepoVisits (never sent anywhere); the ones you return to most are fetched
// into the persisted cache (~/lib/cache → IndexedDB) so the landing page
// (README, file tree) and repo metadata open instantly and offline, plus the
// issues / pull requests / discussions the user participated in or watched,
// and each repo's open issue/PR/discussion lists. Auto-kept repos are ranked by
// the same recency-decayed score the home "favourites" list uses and capped at
// a configurable `maxCount` (default 100); pinned repos are always kept offline
// and never pushed out by ranking.
//
// Prefetching only ever *adds* to the cache: it seeds a repo when it isn't
// stored yet and otherwise leaves the copy alone, so it never competes with the
// live page's own stale-while-revalidate freshness and never hammers the forge
// on a repo the user has already visited (whose data refreshes naturally).
import { getForge } from '~/lib/forges'
import { cacheExists, invalidate, prefetch } from '~/lib/cache'
import { idbKeys } from '~/lib/idb-store'
import { loadRepoCode } from '~/lib/repo-code'
import { isForgeRateLimit } from '~/utils/forge-errors'
import { useRepoVisits } from './useRepoVisits'
import type { ForgeId, ForgeProvider, ForgeRepo, RepoLocator } from '~/types/forge'

export const OFFLINE_DEFAULT_MAX_COUNT = 100
const MAX_COUNT_MIN = 10
const MAX_COUNT_MAX = 500

const SETTINGS_KEY = 'maintainers.space:offline-repos'
/** Cap on tracked detail pages, so the protected (watched) set stays bounded. */
const WATCHED_MAX = 500
/** Detail pages (issues/PRs/discussions) the user opened, kept offline when their repo is. */
const WATCHED_KEY = 'maintainers.space:offline-watched'

export interface RepoRef {
  provider: string
  owner: string
  name: string
  /** Private repos are never written to the offline cache (public-only storage). */
  isPrivate?: boolean
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
const _watched = ref<string[]>([])
let _loaded = false
/**
 * Per-run budget of forge API requests, so one auto() run can never issue an
 * unbounded burst (default 100 repos × several requests each). Decremented as
 * each seed request is issued; the run stops when it hits zero.
 */
let _runBudget = 0
/** When a forge rate-limits us mid-run, stop issuing further requests. */
let _rateLimited = false
const RUN_REQUEST_BUDGET = 300

function clampMaxCount(n: number): number {
  return Math.min(MAX_COUNT_MAX, Math.max(MAX_COUNT_MIN, Math.round(n)))
}

function keyOf(r: RepoRef): string {
  return `${r.provider}/${r.owner}/${r.name}`
}

function isRef(r: unknown): r is RepoRef {
  if (typeof r !== 'object' || !r) return false
  const o = r as Record<string, unknown>
  return (
    typeof o.provider === 'string' &&
    typeof o.owner === 'string' &&
    typeof o.name === 'string' &&
    (o.isPrivate === undefined || typeof o.isPrivate === 'boolean')
  )
}

/** Private repositories are never cached — only public, read-only data is stored. */
function isCacheable(r: RepoRef): boolean {
  return !r.isPrivate
}

function load(): void {
  if (_loaded || !import.meta.client) return
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null')
    if (typeof raw?.enabled === 'boolean') _enabled.value = raw.enabled
    if (typeof raw?.maxCount === 'number') _maxCount.value = clampMaxCount(raw.maxCount)
    if (Array.isArray(raw?.pinned)) _pinned.value = raw.pinned.filter(isRef)
    const w = JSON.parse(localStorage.getItem(WATCHED_KEY) || '[]')
    if (Array.isArray(w)) _watched.value = w.filter((k) => typeof k === 'string')
  } catch {
    /* keep defaults */
  }
  _loaded = true
}

/**
 * Forget all offline-availability state (pinned set, watched detail pages).
 * Kept separate from `load()` so sign-out can leave the module defaults while
 * another account's data isn't visible.
 */
function clearAll(): void {
  _enabled.value = true
  _maxCount.value = OFFLINE_DEFAULT_MAX_COUNT
  _pinned.value = []
  _watched.value = []
  if (import.meta.client) {
    localStorage.removeItem(SETTINGS_KEY)
    localStorage.removeItem(WATCHED_KEY)
  }
}

/** Module-level hook for sign-out: clear local offline state. */
export function clearOfflineState(): void {
  clearAll()
}

function persist(): void {
  if (!import.meta.client) return
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({ enabled: _enabled.value, maxCount: _maxCount.value, pinned: _pinned.value })
  )
}

/** True when the current run should stop issuing forge requests. */
function runExhausted(): boolean {
  return _rateLimited || _runBudget <= 0
}

/**
 * Spend one request from the run budget, and short-circuit when the budget is
 * spent or a forge rate-limited us. Returns the prefetch result, or undefined
 * when the run is exhausted.
 */
function runRequest<T>(
  key: string,
  fetcher: () => Promise<T>,
  force = false
): Promise<T | undefined> | undefined {
  if (runExhausted()) return undefined
  _runBudget--
  return prefetch(key, fetcher, { force })
}

/** Crawl one repo's offline surface (metadata + landing page + lists + watched detail pages). */
async function seedRepo(r: RepoRef, force = false): Promise<void> {
  const f = getForge(r.provider)
  if (!f || !r.owner || !r.name || !isCacheable(r) || runExhausted()) return
  const prefix = `${r.provider}:${r.owner}:${r.name}`
  const metaKey = `repo-meta:${prefix}`
  const codeKey = `repo-code:${prefix}`
  const locator = { owner: r.owner, name: r.name }
  const repo = await runRequest<ForgeRepo>(
    metaKey,
    (): Promise<ForgeRepo> => {
      if (f.getRepo) return f.getRepo(r.owner, r.name)
      return f.getOverview(r.owner, r.name).then((ov) => ov.repo)
    },
    force
  )
  if (runExhausted() || !repo?.defaultBranch) return
  // A watched/auto repo only becomes private once we look it up (the home feed
  // doesn't know visibility); drop its cached metadata and stop seeding.
  if (repo.isPrivate) {
    invalidate(metaKey)
    return
  }
  await runRequest(
    codeKey,
    () => loadRepoCode(f, locator, r.owner, r.name, repo.defaultBranch),
    force
  )
  await prefetchRepoLocales(f, locator, prefix, force)
}

/** Deduplicate the list of opener functions for the lists a forge can prefetch. */
function itemListFetchers(
  f: ForgeProvider,
  locator: RepoLocator,
  prefix: string,
  token: string | undefined
): Array<[string, () => Promise<unknown>]> {
  const lists: Array<[string, () => Promise<unknown>]> = []
  // Seed every state the live pages request, so each filter has an offline copy.
  if (f.listIssues) {
    lists.push([
      `issues:${prefix}:open`,
      () => f.listIssues!(locator, { token, state: 'open', limit: 30 })
    ])
    lists.push([
      `issues:${prefix}:closed`,
      () => f.listIssues!(locator, { token, state: 'closed', limit: 30 })
    ])
  }
  if (f.listPulls) {
    lists.push([
      `pulls:${prefix}:open`,
      () => f.listPulls!(locator, { token, state: 'open', limit: 30 })
    ])
    lists.push([
      `pulls:${prefix}:closed`,
      () => f.listPulls!(locator, { token, state: 'closed', limit: 30 })
    ])
    lists.push([
      `pulls:${prefix}:merged`,
      () => f.listPulls!(locator, { token, state: 'merged', limit: 30 })
    ])
  }
  if (f.listDiscussions)
    lists.push([
      `discussions:${prefix}:${token ? 'auth' : 'anon'}`,
      () => f.listDiscussions!(locator, { token, limit: 30 })
    ])
  return lists
}

/** Resolve a single watched detail cache key into its forge fetcher, when supported. */
function detailFetcher(
  f: ForgeProvider,
  locator: RepoLocator,
  key: string,
  token: string | undefined
): (() => Promise<unknown>) | undefined {
  const [kind, , , , rawId] = key.split(':')
  if (!rawId) return undefined
  const itemId = rawId as string
  if (kind === 'issue' && f.getIssue) {
    const getIssue = f.getIssue
    return () => getIssue(locator, itemId, { token })
  }
  if (kind === 'pull' && f.getPull) {
    const getPull = f.getPull
    return () => getPull(locator, itemId, { token })
  }
  if (kind === 'discussion' && f.getDiscussion) {
    const getDiscussion = f.getDiscussion
    return () => getDiscussion(locator, itemId, { token })
  }
  return undefined
}

/** Prefetch a repo's item lists and any detail pages the user opened / watched. */
async function prefetchRepoLocales(
  f: ForgeProvider,
  locator: RepoLocator,
  prefix: string,
  force = false
): Promise<void> {
  const { get: getToken } = useForgeTokens()
  const providerId = prefix.split(':')[0] as ForgeId
  const token = getToken(providerId)

  for (const [key, fetcher] of itemListFetchers(f, locator, prefix, token)) {
    if (runExhausted()) return
    try {
      await runRequest(key, fetcher, force)
    } catch (e) {
      if (isForgeRateLimit(e)) _rateLimited = true
    }
  }

  // Detail pages the user participated in / watched, scoped to this repo. Keys
  // look like `issue:<provider>:<owner>:<name>:<id>`, so match the base prefix.
  for (const key of _watched.value) {
    if (
      !key.startsWith(`issue:${prefix}:`) &&
      !key.startsWith(`pull:${prefix}:`) &&
      !key.startsWith(`discussion:${prefix}:`)
    )
      continue
    const fetcher = detailFetcher(f, locator, key, token)
    if (!fetcher || runExhausted()) continue
    try {
      await runRequest(key, fetcher, force)
    } catch (e) {
      if (isForgeRateLimit(e)) _rateLimited = true
    }
  }
}

/**
 * Remember that the user opened a repo's item page so it is kept offline (along
 * with its repo) when the repo itself is made available offline.
 */
function watchDetail(
  kind: 'issue' | 'pull' | 'discussion',
  provider: string,
  owner: string,
  name: string,
  id: string
): void {
  if (!import.meta.client || !id) return
  const key = `${kind}:${provider}:${owner}:${name}:${id}`
  // Keep the most recent items; older watched entries fall out so the protected
  // (non-evicted) set stays bounded. Re-opening an item moves it back to the
  // front so it keeps its recency instead of being pushed out by newer one-offs.
  if (_watched.value[0] === key) return
  _watched.value = [key, ..._watched.value.filter((k) => k !== key)].slice(0, WATCHED_MAX)
  localStorage.setItem(WATCHED_KEY, JSON.stringify(_watched.value))
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
    // Repos with items you participated in / watched are always strong candidates,
    // even if your raw visit count is low — so their PRs/issues/discussions
    // (recorded via watch) stay available offline.
    const watchedSet = new Set<string>()
    for (const k of _watched.value) {
      // key looks like <kind>:<provider>:<owner>:<name>:<id>
      const [, provider, owner, name] = k.split(':')
      if (provider && owner && name) watchedSet.add(`${provider}/${owner}/${name}`)
    }
    const fromWatched: RepoRef[] = []
    for (const k of watchedSet) {
      if (pinnedSet.has(k)) continue
      const [provider, owner, name] = k.split('/')
      if (provider && owner && name) fromWatched.push({ provider, owner, name })
    }
    // Watched repos share the same `maxCount` budget as auto-kept ones — bound
    // them by whatever remains after pinned + top visits so the offline store
    // can never exceed `maxCount` repositories (which would otherwise drive the
    // eviction budget to zero and evict every auto-kept repo). `watchedSet` is
    // newest-first, so the most recently watched repos win the remaining slots.
    const budget = Math.max(0, _maxCount.value - pinnedSet.size - autoCandidates.length)
    return [
      ..._pinned.value,
      ...autoCandidates.map((v) => ({ provider: v.provider, owner: v.owner, name: v.name })),
      ...fromWatched.slice(0, budget)
    ].filter((r) => r.provider && r.owner && r.name && isCacheable(r))
  }

  /** Seed every candidate (best-effort). No-op while already running or disabled. */
  async function auto(): Promise<void> {
    if (_running.value || !_enabled.value) return
    _running.value = true
    _runBudget = RUN_REQUEST_BUDGET
    _rateLimited = false
    try {
      for (const r of candidates()) {
        if (runExhausted()) break
        try {
          await seedRepo(r)
        } catch (e) {
          if (isForgeRateLimit(e)) _rateLimited = true
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
    if (!isCacheable(repo)) {
      throw new Error('Private repositories are never stored offline.')
    }
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

  /**
   * Bound the offline store to `maxCount` *repositories* (by metadata entries).
   * Pinned repos and repos the user has watched items in are never evicted; among
   * the remaining auto-kept repos, the whole repo (metadata + landing + any item
   * pages) is dropped one at a time until under the cap. Because we drop in a
   * deterministic but storage-bounded order and only when over the cap — never by
   * age — repos this user rarely visits stay offline for a long time, which is
   * the point: auto-clean happens only when storage would otherwise grow unbounded.
   */
  async function evictExcess(): Promise<void> {
    if (!import.meta.client) return
    // Never protect a private repo: if legacy data for one exists (pinned before
    // the public-only rule), it is an eviction candidate so it gets cleaned up.
    const cacheableProtected = _pinned.value.filter(isCacheable).map(keyOf)
    // Watch protection mirrors the *capped* candidate set (`candidates()` keeps at
    // most `maxCount` watched repos), so lowering maxCount actually shrinks the
    // store instead of leaving old watched repos permanently protected.
    const cappedWatched = candidates()
      .map(keyOf)
      .filter((r) => !cacheableProtected.includes(r))
    const protectedRefs = new Set([...cacheableProtected, ...cappedWatched])

    // Attribute every stored cache key to the repository (provider/owner/name)
    // it belongs to. Repo keys look like `<kind>:<provider>:<owner>:<name>[:<rest>]`.
    const repos = new Map<string, string[]>()
    const addTo = (kindLen: number, key: string): void => {
      const rest = key.slice(kindLen)
      const [provider, owner, name] = rest.split(':')
      if (!provider || !owner || !name) return
      const ref = `${provider}/${owner}/${name}`
      if (!repos.has(ref)) repos.set(ref, [])
      repos.get(ref)!.push(key)
    }
    for (const key of await idbKeys()) {
      if (key.startsWith('repo-meta:')) addTo('repo-meta:'.length, key)
      else if (key.startsWith('repo-code:')) addTo('repo-code:'.length, key)
      else if (key.startsWith('issue:')) addTo('issue:'.length, key)
      else if (key.startsWith('pull:')) addTo('pull:'.length, key)
      else if (key.startsWith('discussion:')) addTo('discussion:'.length, key)
      else if (key.startsWith('issues:')) addTo('issues:'.length, key)
      else if (key.startsWith('pulls:')) addTo('pulls:'.length, key)
      else if (key.startsWith('discussions:')) addTo('discussions:'.length, key)
      else if (key.startsWith('actions:')) addTo('actions:'.length, key)
      else if (key.startsWith('commits:')) addTo('commits:'.length, key)
      else if (key.startsWith('commit:')) addTo('commit:'.length, key)
      else if (key.startsWith('tree:')) addTo('tree:'.length, key)
      else if (key.startsWith('blob:')) addTo('blob:'.length, key)
    }

    const evictionCandidates = [...repos.entries()].filter(([ref]) => !protectedRefs.has(ref))
    // Only protected refs that are actually stored count toward capacity; a
    // pinned/watched repo with no cached data yet must not inflate the rear-side
    // budget and make us evict a stored repo it no longer fits.
    const storedProtected = [...repos.keys()].filter((r) => protectedRefs.has(r))
    let over = evictionCandidates.length - Math.max(0, _maxCount.value - storedProtected.length)
    if (over <= 0) return
    // Evict least-favoured first: idbKeys() returns cursor order (arbitrary), so
    // rely on the repo-visit ranking rather than key order to decide what to drop.
    const { favourites } = useRepoVisits()
    const rank = new Map<string, number>()
    favourites.value.forEach((v, i) => rank.set(keyOf(v), i))
    evictionCandidates.sort(
      (a, b) =>
        (rank.get(b[0]) ?? Number.MAX_SAFE_INTEGER) - (rank.get(a[0]) ?? Number.MAX_SAFE_INTEGER)
    )
    // Drop whole repos (metadata + landing + item pages) until under the cap.
    // Purely storage-bounded and never age-based, so infrequently-visited repos
    // stay offline for as long as they fit.
    for (const [, owned] of evictionCandidates) {
      if (over <= 0) break
      for (const k of owned) invalidate(k)
      over--
    }
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
    isAvailable,
    /** Record a detail page the user opened so its repo keeps it offline (see watchDetail). */
    watch: watchDetail
  }
}
