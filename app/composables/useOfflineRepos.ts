// Offline availability for repositories.
//
// The PWA shell already precaches the app itself; this makes individual repos
// viewable with zero connectivity. Every repo you open is tracked locally by
// useRepoVisits (never sent anywhere) and fetched into the persisted cache
// (~/lib/cache → IndexedDB) so the landing page
// (README, file tree) and repo metadata open instantly and offline, plus the
// issues / pull requests / discussions the user participated in or watched,
// and each repo's open issue/PR/discussion lists. The most recently visited
// repos win the automatic cache budget, after pinned repos and repos containing
// a recently opened item. This makes the current repo available immediately
// while preserving a deterministic, configurable `maxCount` (default 100).
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
  /** Automatically keep recently visited repos available offline. */
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
/** A visit that arrives during a run gets one deterministic follow-up pass. */
let _rerunRequested = false
/** The shared crawl callers await, including any queued follow-up pass. */
let _run: Promise<void> | null = null
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
  _rerunRequested = false
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
      if (f.features.repoRead!.getRepo) return f.features.repoRead!.getRepo!(r.owner, r.name)
      return f.features.repoRead!.getOverview!(r.owner, r.name).then((ov) => ov?.repo)
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
  const code = await runRequest(
    codeKey,
    () => loadRepoCode(f, locator, r.owner, r.name, repo.defaultBranch),
    force
  )
  if (code)
    await prefetchRepoHealthFiles(f, locator, prefix, repo.defaultBranch, code.health, force)
  await prefetchRepoLocales(f, locator, prefix, force)
  await prefetchRepoCommits(f, locator, prefix, repo.defaultBranch, force)
}

/** Store the documentation surfaced on a repo landing page with the landing page itself. */
async function prefetchRepoHealthFiles(
  f: ForgeProvider,
  locator: RepoLocator,
  prefix: string,
  defaultBranch: string,
  health: Awaited<ReturnType<typeof loadRepoCode>>['health'],
  force = false
): Promise<void> {
  if (!f.features.codeRead!.getBlob) return
  for (const file of health) {
    if (runExhausted()) return
    try {
      await runRequest(
        `blob:${prefix}:${defaultBranch}:${file.path}`,
        () => f.features.codeRead!.getBlob!(locator, defaultBranch, file.path),
        force
      )
    } catch (e) {
      if (isForgeRateLimit(e)) _rateLimited = true
    }
  }
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
  if (f.features.issueRead!.listIssues) {
    lists.push([
      `issues:${prefix}:open`,
      () => f.features.issueRead!.listIssues!(locator, { token, state: 'open', limit: 30 })
    ])
    lists.push([
      `issues:${prefix}:closed`,
      () => f.features.issueRead!.listIssues!(locator, { token, state: 'closed', limit: 30 })
    ])
  }
  if (f.features.pullRead!.listPulls) {
    lists.push([
      `pulls:${prefix}:open`,
      () => f.features.pullRead!.listPulls!(locator, { token, state: 'open', limit: 30 })
    ])
    lists.push([
      `pulls:${prefix}:closed`,
      () => f.features.pullRead!.listPulls!(locator, { token, state: 'closed', limit: 30 })
    ])
    lists.push([
      `pulls:${prefix}:merged`,
      () => f.features.pullRead!.listPulls!(locator, { token, state: 'merged', limit: 30 })
    ])
  }
  if (f.features.discussionRead!.listDiscussions)
    lists.push([
      `discussions:${prefix}:${token ? 'auth' : 'anon'}`,
      () => f.features.discussionRead!.listDiscussions!(locator, { token, limit: 30 })
    ])
  if (f.features.actionRead!.listActionRuns)
    lists.push([
      `actions:${prefix}`,
      () => f.features.actionRead!.listActionRuns!(locator, { limit: 30 })
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
  if (kind === 'issue' && f.features.issueRead!.getIssue) {
    const getIssue = f.features.issueRead!.getIssue
    return () => getIssue(locator, itemId, { token })
  }
  if (kind === 'pull' && f.features.pullRead!.getPull) {
    const getPull = f.features.pullRead!.getPull
    return () => getPull(locator, itemId, { token })
  }
  if (kind === 'discussion' && f.features.discussionRead!.getDiscussion) {
    const getDiscussion = f.features.discussionRead!.getDiscussion
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

/** Seed the same first commit page shown by the repo's commits screen. */
async function prefetchRepoCommits(
  f: ForgeProvider,
  locator: RepoLocator,
  prefix: string,
  defaultBranch: string,
  force = false
): Promise<void> {
  if (!f.features.commitRead!.listCommits || runExhausted()) return
  try {
    await runRequest(
      `commits:${prefix}:${defaultBranch}`,
      () => f.features.commitRead!.listCommits!(locator, defaultBranch, { limit: 30 }),
      force
    )
  } catch (e) {
    if (isForgeRateLimit(e)) _rateLimited = true
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

  /** Top candidates: pinned, watched, then most-recently visited repositories. */
  function candidates(): RepoRef[] {
    const pinnedSet = new Set(_pinned.value.map(keyOf))
    // Repos with an opened item are first after explicit pins. `_watched` is
    // newest-first, so an item remains readable even when its repo was only a
    // brief visit and the automatic budget is full.
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
    const watched = fromWatched.slice(0, Math.max(0, _maxCount.value - pinnedSet.size))
    const watchedKeys = new Set(watched.map(keyOf))
    const { recent } = useRepoVisits()
    const recentVisits = recent.value
      .filter((v) => !pinnedSet.has(keyOf(v)) && !watchedKeys.has(keyOf(v)))
      .slice(0, Math.max(0, _maxCount.value - pinnedSet.size - watched.length))
    return [
      ..._pinned.value,
      ...watched,
      ...recentVisits.map((v) => ({ provider: v.provider, owner: v.owner, name: v.name }))
    ].filter((r) => r.provider && r.owner && r.name && isCacheable(r))
  }

  async function seedCandidates(): Promise<void> {
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
  }

  /**
   * Start one shared crawl. Calls made while it is running await this promise;
   * a concurrent visit requests one final candidate pass before it resolves.
   */
  function run(seed: () => Promise<void>): Promise<void> {
    const work = (async () => {
      let next = seed
      do {
        _rerunRequested = false
        await next()
        next = seedCandidates
      } while (_rerunRequested)
      await evictExcess()
    })()
    _run = work.finally(() => {
      _run = null
    })
    return _run
  }

  /** Seed every candidate (best-effort), with one follow-up for concurrent visits. */
  function auto(): Promise<void> {
    if (!_enabled.value) return Promise.resolve()
    if (_run) {
      _rerunRequested = true
      return _run
    }
    return run(seedCandidates)
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

  /**
   * Fill a newly opened public repo after its visible header has loaded.
   * `auto()` owns the shared request budget, so visits cannot create an
   * unbounded foreground request burst.
   */
  function visit(repo: RepoRef): void {
    if (_enabled.value && isCacheable(repo)) void auto()
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
    if (_run) {
      // The pin is already in `candidates()`. Add a pass after the in-flight
      // crawl, and do not resolve until that pass has seeded it.
      _rerunRequested = true
      await _run
      return
    }
    await run(async () => {
      _running.value = true
      _runBudget = RUN_REQUEST_BUDGET
      _rateLimited = false
      try {
        await seedRepo(repo, true)
      } finally {
        _running.value = false
      }
    })
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
   * Pinned repos and the current bounded candidate set are never evicted; the
   * rest are dropped as whole repos (metadata + landing + item pages) until
   * under the cap. Candidate order is deterministic, so opening a repo promotes
   * it and makes room by removing an older unpinned repo.
   */
  async function evictExcess(): Promise<void> {
    if (!import.meta.client) return
    // Never protect a private repo: if legacy data for one exists (pinned before
    // the public-only rule), it is an eviction candidate so it gets cleaned up.
    const cacheableProtected = _pinned.value.filter(isCacheable).map(keyOf)
    // Protection mirrors the *capped* candidate set, so lowering maxCount
    // actually shrinks the store instead of preserving old automatic entries.
    const cappedCandidates = candidates()
      .map(keyOf)
      .filter((r) => !cacheableProtected.includes(r))
    const protectedRefs = new Set([...cacheableProtected, ...cappedCandidates])

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
    // Evict least-recent first: idbKeys() returns cursor order (arbitrary), so
    // rely on local visit recency rather than key order to decide what to drop.
    const { recent } = useRepoVisits()
    const rank = new Map<string, number>()
    recent.value.forEach((v, i) => rank.set(keyOf(v), i))
    evictionCandidates.sort(
      (a, b) =>
        (rank.get(b[0]) ?? Number.MAX_SAFE_INTEGER) - (rank.get(a[0]) ?? Number.MAX_SAFE_INTEGER)
    )
    // Drop whole repos (metadata + landing + item pages) until under the cap.
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
    visit,
    /** Record a detail page the user opened so its repo keeps it offline (see watchDetail). */
    watch: watchDetail
  }
}
