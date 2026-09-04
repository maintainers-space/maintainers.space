// Client-side response cache shared by every forge provider and feed composable.
// A small in-memory cache with stale-while-revalidate semantics: within the
// fresh window a request is served from memory; within the stale window the
// cached value is returned instantly while a fresh copy is fetched in the
// background. A `force` flag bypasses the cache — that is what "reload" uses.
//
// Every entry is also written through to IndexedDB (~/lib/idb-store), so the
// last known-good value survives a full reload — closing the PWA, losing
// connectivity, reopening later — not just in-memory navigation. When the
// device is offline, `cached()` never attempts the network at all: it serves
// whatever it has (memory, or IndexedDB on a cold start) instead of failing.

import { idbClear, idbDelete, idbDeletePrefix, idbGet, idbSet } from '~/lib/idb-store'

export const TTL = {
  /** ~1 minute — PR status, notifications, CI. */
  SHORT: 60_000,
  /** ~5 minutes — timelines, trending, following, profiles. */
  MEDIUM: 300_000
} as const

interface Entry<T> {
  value: T
  /** Timestamp after which the value is stale (needs revalidation). */
  fresh: number
  /** Timestamp after which the value must not be served at all. */
  dead: number
  /** In-flight fetch, so concurrent callers share one request. Never persisted. */
  pending?: Promise<T>
}

const store = new Map<string, Entry<unknown>>()

function isOffline(): boolean {
  return import.meta.client && typeof navigator !== 'undefined' && navigator.onLine === false
}

/** Strip the in-flight promise before writing to IndexedDB — it isn't cloneable. */
function persistable<T>(entry: Entry<T>): Omit<Entry<T>, 'pending'> {
  return { value: entry.value, fresh: entry.fresh, dead: entry.dead }
}

export interface CacheOptions<T> {
  /** Fresh window in ms (default {@link TTL.MEDIUM}). */
  ttl?: number
  /** Extra window after `ttl` during which stale data is served while revalidating (default = ttl). */
  swr?: number
  /** Bypass the cache, fetch fresh, and replace the entry. */
  force?: boolean
  /**
   * Called when a *background* revalidation (triggered by serving stale data)
   * resolves with a newer value, so the UI can update in place.
   */
  onRevalidate?: (value: T) => void
}

/**
 * Run `fetcher` behind a stale-while-revalidate cache keyed by `key`.
 * Returns fresh or stale-but-valid data immediately; refetches in the
 * background when stale. Rejections are never cached. While offline, always
 * serves whatever is known (memory or IndexedDB) and never touches the network.
 */
export async function cached<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts: CacheOptions<T> = {}
): Promise<T> {
  const ttl = opts.ttl ?? TTL.MEDIUM
  const swr = opts.swr ?? ttl
  const now = Date.now()
  let existing = store.get(key) as Entry<T> | undefined

  // Cold start (nothing in memory yet this session): hydrate from IndexedDB
  // before deciding whether to hit the network.
  if (!existing) {
    const persisted = await idbGet<Omit<Entry<T>, 'pending'>>(key)
    if (persisted) {
      existing = persisted
      store.set(key, persisted)
    }
  }

  if (isOffline()) {
    if (existing?.pending) return existing.pending
    if (existing) return existing.value
    throw new Error('You appear to be offline, and there is no cached data for this yet.')
  }

  const runFetch = (): Promise<T> => {
    const p = fetcher()
      .then((value) => {
        const entry: Entry<T> = { value, fresh: Date.now() + ttl, dead: Date.now() + ttl + swr }
        store.set(key, entry)
        void idbSet(key, persistable(entry))
        return value
      })
      .catch((err) => {
        // Drop only the in-flight marker; keep any prior value for stale reads.
        const cur = store.get(key) as Entry<T> | undefined
        if (cur?.pending === p) delete cur.pending
        throw err
      })
    // Record the in-flight promise so parallel callers dedupe onto it.
    const base: Entry<T> = existing ?? { value: undefined as unknown as T, fresh: 0, dead: 0 }
    store.set(key, { ...base, pending: p })
    return p
  }

  if (opts.force) return runFetch()

  if (existing) {
    if (existing.pending) return existing.pending
    if (now < existing.fresh) return Promise.resolve(existing.value)
    if (now < existing.dead) {
      // Stale but usable: serve now, revalidate in the background.
      runFetch()
        .then((v) => opts.onRevalidate?.(v))
        .catch(() => {
          /* keep stale value */
        })
      return Promise.resolve(existing.value)
    }
  }

  return runFetch()
}

export interface PrefetchOptions {
  /**
   * Always (re)fetch instead of skipping when an offline copy already exists.
   * Use when the user explicitly seeds a repo and expects it ready now.
   */
  force?: boolean
}

/**
 * Ensure a value exists for `key` so the page can be read offline, *without*
 * disturbing normal staleness. Unlike {@link cached}, this never refetches
 * just because a copy is old: offline availability only needs an entry to
 * exist, and a normal page visit handles freshness behind
 * stale-while-revalidate. Skips entirely while offline (returning the stored
 * value when one exists, otherwise `undefined`), and dedupes on {@link
 * cached}'s in-flight promise when two callers race to seed the same key.
 * Returns the stored value if present, or the freshly-fetched one.
 */
export async function prefetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts: PrefetchOptions = {}
): Promise<T | undefined> {
  if (isOffline()) {
    const mem = store.get(key)
    if (mem?.value !== undefined) return mem.value as T
    const persisted = await idbGet<T>(key)
    return persisted
  }
  if (!opts.force) {
    const mem = store.get(key)
    if (mem?.value !== undefined) return mem.value as T
    const persisted = await idbGet<T>(key)
    if (persisted !== undefined) {
      store.set(key, persisted as unknown as Entry<T>)
      return persisted
    }
  }
  return await cached(key, fetcher, { force: true })
}

/** True when `key` has a real value in memory (a failed fetch leaves a valueless entry). */
function hasValue(key: string): boolean {
  const e = store.get(key)
  return e !== undefined && e.value !== undefined
}

/** Whether an entry exists for `key` in memory or IndexedDB (offline readable). */
export async function cacheExists(key: string): Promise<boolean> {
  if (hasValue(key)) return true
  return (await idbGet<unknown>(key)) !== undefined
}

/** Drop a single key (or every key with the given prefix when `prefix` is true). */
export function invalidate(key: string, prefix = false): void {
  if (!prefix) {
    store.delete(key)
    void idbDelete(key)
    return
  }
  for (const k of store.keys()) {
    if (k.startsWith(key)) store.delete(k)
  }
  void idbDeletePrefix(key)
}

/** Clear the entire cache (e.g. on sign-out, so another account can't read it). */
export function clearCache(): void {
  store.clear()
  void idbClear()
}
