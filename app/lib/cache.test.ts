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
})

describe('invalidate', () => {
  it('drops a single key', async () => {
    await prefetch('repo-code:a:b', async () => ({}))
    expect(await cacheExists('repo-code:a:b')).toBe(true)
    invalidate('repo-code:a:b')
    expect(await cacheExists('repo-code:a:b')).toBe(false)
  })
})
