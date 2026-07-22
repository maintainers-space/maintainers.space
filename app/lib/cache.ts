// Client-side response cache shared by every forge provider and feed composable.
// A small in-memory cache with stale-while-revalidate semantics: within the
// fresh window a request is served from memory; within the stale window the
// cached value is returned instantly while a fresh copy is fetched in the
// background. A `force` flag bypasses the cache — that is what "reload" uses.

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
  /** In-flight fetch, so concurrent callers share one request. */
  pending?: Promise<T>
}

const store = new Map<string, Entry<unknown>>()

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
 * background when stale. Rejections are never cached.
 */
export function cached<T>(key: string, fetcher: () => Promise<T>, opts: CacheOptions<T> = {}): Promise<T> {
  const ttl = opts.ttl ?? TTL.MEDIUM
  const swr = opts.swr ?? ttl
  const now = Date.now()
  const existing = store.get(key) as Entry<T> | undefined

  const runFetch = (): Promise<T> => {
    const p = fetcher()
      .then((value) => {
        store.set(key, { value, fresh: Date.now() + ttl, dead: Date.now() + ttl + swr })
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
      runFetch().then(v => opts.onRevalidate?.(v)).catch(() => { /* keep stale value */ })
      return Promise.resolve(existing.value)
    }
  }

  return runFetch()
}

/** Drop a single key (or every key with the given prefix when `prefix` is true). */
export function invalidate(key: string, prefix = false): void {
  if (!prefix) {
    store.delete(key)
    return
  }
  for (const k of store.keys()) {
    if (k.startsWith(key)) store.delete(k)
  }
}

/** Clear the entire cache (e.g. on sign-out, so another account can't read it). */
export function clearCache(): void {
  store.clear()
}
