import { ForbiddenError, RateLimitedError } from 'forges'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { describeForgeError, isForgeRateLimit } from './forge-errors'

describe('describeForgeError', () => {
  it('passes through a plain message unchanged', () => {
    expect(describeForgeError(new Error('Not found'))).toEqual({ description: 'Not found' })
  })

  it('offers a repo-scoped token for organisation OAuth restrictions', () => {
    const error = new ForbiddenError('Forbidden', 403, '', 'org_restriction')
    const hint = describeForgeError(error, { provider: 'github', owner: 'nuxt', name: 'nuxt' })
    expect(hint.to).toBe('/settings/accounts?pat=github%3Anuxt%2Fnuxt')
    expect(hint.linkLabel).toBe('Provide a repo-scoped token')
    expect(hint.description).toContain('restricts third-party OAuth apps')
  })

  it('links to account settings for OAuth restrictions without a known repository', () => {
    const hint = describeForgeError(new ForbiddenError('Forbidden', 403, '', 'org_restriction'))
    expect(hint.to).toBe('/settings/accounts')
  })

  it('does not treat other forbidden reasons as an OAuth restriction', () => {
    const hint = describeForgeError(new ForbiddenError('Archived', 403, '', 'resource_protected'))
    expect(hint).toEqual({ description: 'Archived' })
  })

  describe('rate limiting', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('reports the reset ETA the forge sent', () => {
      const resetAt = new Date(Date.now() + 5 * 60_000)
      const hint = describeForgeError(new RateLimitedError('Limited', 429, '', { resetAt }))
      expect(hint.description).toContain('about 5 minutes')
      expect(hint.to).toBe('/settings/accounts')
    })

    it('falls back to a generic wait without a reset time', () => {
      const hint = describeForgeError(new RateLimitedError('Limited', 429, ''))
      expect(hint.description).toContain('try again shortly')
    })

    it('detects rate limits by error class', () => {
      expect(isForgeRateLimit(new RateLimitedError('Limited', 429, ''))).toBe(true)
      expect(isForgeRateLimit(new Error('rate limit'))).toBe(false)
    })
  })
})
