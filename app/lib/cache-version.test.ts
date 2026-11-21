import { afterEach, describe, expect, it, vi } from 'vitest'

// IndexedDB as an in-memory map, so entries written by another app version can be planted.
const stored = new Map<string, unknown>()
vi.mock('~/lib/idb-store', () => ({
  idbClear: async () => stored.clear(),
  idbDelete: async (key: string) => void stored.delete(key),
  idbDeletePrefix: async (prefix: string) => {
    for (const key of stored.keys()) if (key.startsWith(prefix)) stored.delete(key)
  },
  idbGet: async (key: string) => stored.get(key),
  idbSet: async (key: string, value: unknown) => void stored.set(key, value)
}))

const { cacheExists, cached, clearCache, prefetch } = await import('./cache')

afterEach(() => {
  clearCache()
  stored.clear()
})

/** An entry as an app version from before cache versioning wrote it: still fresh, old shape. */
function plantLegacyEntry(key: string, value: unknown): void {
  stored.set(key, { dead: Date.now() + 600_000, fresh: Date.now() + 300_000, value })
}

describe('cache entries from another app version', () => {
  it('refetches instead of serving data an older version stored', async () => {
    plantLegacyEntry('repo-meta:github:nuxt:nuxt', { fullName: 'nuxt/nuxt' })
    const fetcher = vi.fn(async () => ({ ref: { name: 'nuxt', owner: 'nuxt' } }))

    const repo = await cached('repo-meta:github:nuxt:nuxt', fetcher)

    expect(repo).toEqual({ ref: { name: 'nuxt', owner: 'nuxt' } })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('does not count an older version’s entry as available offline', async () => {
    plantLegacyEntry('repo-code:github:nuxt:nuxt', { tree: [] })

    expect(await cacheExists('repo-code:github:nuxt:nuxt')).toBe(false)
    const fetcher = vi.fn(async () => ({ entries: [] }))
    await prefetch('repo-code:github:nuxt:nuxt', fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('still serves what this version stored, after a reload', async () => {
    await cached('repo-meta:github:nuxt:nuxt', async () => ({ ref: { owner: 'nuxt' } }))
    // A reload empties memory but keeps IndexedDB; clearCache() empties both, so restore it.
    const persisted = new Map(stored)
    clearCache()
    for (const [key, value] of persisted) stored.set(key, value)
    const fetcher = vi.fn(async () => ({ ref: { owner: 'refetched' } }))

    expect(await cached('repo-meta:github:nuxt:nuxt', fetcher)).toEqual({ ref: { owner: 'nuxt' } })
    expect(fetcher).not.toHaveBeenCalled()
  })
})
