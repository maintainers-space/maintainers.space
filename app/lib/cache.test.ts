import { afterEach, describe, expect, it, vi } from 'vitest'
import { cacheExists, cached, clearCache, invalidate, prefetch } from './cache'

afterEach(() => {
  clearCache()
  vi.unstubAllGlobals()
})

describe('prefetch', () => {
  it('fetches and stores a value for offline use', async () => {
    const fetcher = vi.fn(async () => ({ id: 1 }))
    await prefetch('repo-code:a:b', fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(await cacheExists('repo-code:a:b')).toBe(true)
  })

  it('skips the fetch when an offline copy already exists', async () => {
    const fetcher = vi.fn(async () => ({ id: 1 }))
    await prefetch('repo-code:a:b', fetcher)
    await prefetch('repo-code:a:b', fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('re-fetches when force is set even if a copy exists', async () => {
    const fetcher = vi.fn(async () => ({ count: 0 }))
    await prefetch('repo-code:a:b', fetcher)
    await prefetch('repo-code:a:b', () => Promise.resolve({ count: 1 }), { force: true })
    const fetched = await cached('repo-code:a:b', async () => ({ count: 99 }))
    expect(fetched).toEqual({ count: 1 })
  })

  it('does not write while offline', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const fetcher = vi.fn(async () => ({ id: 1 }))
    await prefetch('repo-code:a:b', fetcher)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('does not treat a failed fetch as an offline copy (no valueless entry)', async () => {
    const failing = vi.fn(async () => {
      throw new Error('network down')
    })
    await expect(prefetch('repo-code:a:b', failing)).rejects.toThrow('network down')
    // The in-flight entry that `cached` leaves behind on rejection must not be
    // mistaken for a stored value, so a later prefetch retries the fetch.
    const ok = vi.fn(async () => ({ id: 1 }))
    await prefetch('repo-code:a:b', ok)
    expect(ok).toHaveBeenCalledTimes(1)
    expect(await cacheExists('repo-code:a:b')).toBe(true)
  })

  it('returns the stored value (not the persisted cache envelope)', async () => {
    const value = { defaultBranch: 'main' }
    await prefetch('repo-meta:github:nuxt:nuxt', async () => value)
    const found = await prefetch('repo-meta:github:nuxt:nuxt', async () => ({
      defaultBranch: 'other'
    }))
    // A warm prefetch returns the stored value, not an IndexedDB `{value, fresh, dead}` wrapper.
    expect(found).toEqual({ defaultBranch: 'main' })
  })

  it('joins a concurrent cold prefetch instead of fetching twice', async () => {
    // Both calls start with no stored value and await IndexedDB (undefined in
    // the test env) before either records pending; single-flight must still
    // issue the fetch exactly once.
    let resolve!: (v: { id: number }) => void
    const gate = new Promise<{ id: number }>((r) => (resolve = r))
    const fetcher = vi.fn(() => gate)
    const a = prefetch('repo-meta:single-flight', fetcher)
    const b = prefetch('repo-meta:single-flight', fetcher)
    // Let both calls hydrate from IndexedDB and reach the fetcher gate.
    await new Promise((r) => setTimeout(r, 0))
    resolve({ id: 1 })
    expect(await a).toEqual({ id: 1 })
    expect(await b).toEqual({ id: 1 })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})

describe('invalidate', () => {
  it('drops a single key', async () => {
    await prefetch('repo-code:a:b', async () => ({}))
    expect(await cacheExists('repo-code:a:b')).toBe(true)
    invalidate('repo-code:a:b')
    expect(await cacheExists('repo-code:a:b')).toBe(false)
  })
})
