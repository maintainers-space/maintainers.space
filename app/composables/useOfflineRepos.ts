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
import { cacheExists, cached, invalidate, prefetch } from '~/lib/cache'
import { idbKeys } from '~/lib/idb-store'
import { loadRepoCode } from '~/lib/repo-code'
import { useRepoVisits } from './useRepoVisits'
import type { ForgeId, ForgeProvider, ForgeRepo, RepoLocator } from '~/types/forge'

export const OFFLINE_DEFAULT_MAX_COUNT = 100
const MAX_COUNT_MIN = 10
const MAX_COUNT_MAX = 500

const SETTINGS_KEY = 'maintainers.space:offline-repos'
/** Detail pages (issues/PRs/discussions) the user opened, kept offline when their repo is. */
const WATCHED_KEY = 'maintainers.space:offline-watched'

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
const _watched = ref<string[]>([])
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
    const w = JSON.parse(localStorage.getItem(WATCHED_KEY) || '[]')
    if (Array.isArray(w)) _watched.value = w.filter((k) => typeof k === 'string')
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

/** Crawl one repo's offline surface (metadata + landing page + lists + watched detail pages). */
async function seedRepo(r: RepoRef, force = false): Promise<void> {
  const f = getForge(r.provider)
  if (!f || !r.owner || !r.name) return
  const prefix = `${r.provider}:${r.owner}:${r.name}`
  const metaKey = `repo-meta:${prefix}`
  const codeKey = `repo-code:${prefix}`
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
  if (f.listIssues)
    lists.push([
      `issues:${prefix}:open`,
      () => f.listIssues!(locator, { token, state: 'open', limit: 30 })
    ])
  if (f.listPulls)
    lists.push([
      `pulls:${prefix}:open`,
      () => f.listPulls!(locator, { token, state: 'open', limit: 30 })
    ])
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
    return () => getPull(locator, itemId)
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
    try {
      await prefetch(key, fetcher, { force })
    } catch {
      /* best-effort */
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
    if (!fetcher) continue
    try {
      await prefetch(key, fetcher, { force })
    } catch {
      /* best-effort */
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
  if (!_watched.value.includes(key)) {
    _watched.value = [..._watched.value, key]
    localStorage.setItem(WATCHED_KEY, JSON.stringify(_watched.value))
  }
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
    return [
      ..._pinned.value,
      ...autoCandidates.map((v) => ({ provider: v.provider, owner: v.owner, name: v.name })),
      ...fromWatched
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
    isAvailable,
    /** Record a detail page the user opened so its repo keeps it offline (see watchDetail). */
    watch: watchDetail
  }
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
  const pinnedSet = new Set(_pinned.value.map(keyOf))
  const watchedSet = new Set<string>()
  for (const k of _watched.value) {
    const [, provider, owner, name] = k.split(':')
    if (provider && owner && name) watchedSet.add(`${provider}/${owner}/${name}`)
  }
  const protectedRefs = new Set([...pinnedSet, ...watchedSet])

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

  const candidates = [...repos.entries()].filter(([ref]) => !protectedRefs.has(ref))
  let over = candidates.length - Math.max(0, _maxCount.value - protectedRefs.size)
  if (over <= 0) return
  // Drop whole repos (metadata + landing + item pages) until under the cap.
  // This is purely storage-bounded and never age-based, so repos the user
  // visits infrequently stay offline for as long as they fit.
  for (const [, owned] of candidates) {
    if (over <= 0) break
    for (const k of owned) invalidate(k)
    over--
  }
}
