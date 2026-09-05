import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { describeForgeError, isForgeRateLimit } from './forge-errors'

function fetchError(status: number, message: string, headers: Record<string, string> = {}) {
  return {
    message,
    response: { status, headers: new Headers(headers) }
  }
}

describe('describeForgeError', () => {
  it('passes through a plain message unchanged', () => {
    expect(describeForgeError({ message: 'Not found' })).toEqual({ description: 'Not found' })
  })

  it('recognizes GitHub OAuth App access restrictions and links to GitHub settings', () => {
    const hint = describeForgeError({ message: 'OAuth App access restrictions are enabled' })
    expect(hint.to).toBe('https://github.com/settings/connections/applications')
    expect(hint.description).toContain("hasn't approved maintainers.space")
  })

  describe('rate limiting', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('treats 429 as a rate limit even without a body message', () => {
      const hint = describeForgeError(fetchError(429, ''))
      expect(hint.description).toMatch(/rate limit/i)
      expect(hint.to).toBe('/settings/accounts')
    })

    it('treats 403 as a rate limit only when the body says so', () => {
      const rateLimited = describeForgeError(fetchError(403, 'API rate limit exceeded'))
      expect(rateLimited.description).toMatch(/rate limit/i)

      const forbidden = describeForgeError(fetchError(403, 'Resource not accessible'))
      expect(forbidden.description).toBe('Resource not accessible')
    })

    it('computes the reset ETA from X-RateLimit-Reset (GitHub-style, unix seconds)', () => {
      const resetAt = Math.floor(new Date('2024-01-01T00:05:00Z').getTime() / 1000)
      const hint = describeForgeError(fetchError(429, '', { 'X-RateLimit-Reset': String(resetAt) }))
      expect(hint.description).toContain('about 5 minutes')
    })

    it('computes the reset ETA from RateLimit-Reset (GitLab-style, no X- prefix)', () => {
      const resetAt = Math.floor(new Date('2024-01-01T00:02:00Z').getTime() / 1000)
      const hint = describeForgeError(fetchError(429, '', { 'RateLimit-Reset': String(resetAt) }))
      expect(hint.description).toContain('about 2 minutes')
    })

    it('falls back to Retry-After in delta-seconds form (Bitbucket-style)', () => {
      const hint = describeForgeError(fetchError(429, '', { 'Retry-After': '120' }))
      expect(hint.description).toContain('about 2 minutes')
    })

    it('falls back to Retry-After as an HTTP-date', () => {
      const hint = describeForgeError(
        fetchError(429, '', { 'Retry-After': 'Mon, 01 Jan 2024 00:03:00 GMT' })
      )
      expect(hint.description).toContain('about 3 minutes')
    })

    it('uses singular "minute" for a 1-minute wait', () => {
      const resetAt = Math.floor(new Date('2024-01-01T00:01:00Z').getTime() / 1000)
      const hint = describeForgeError(fetchError(429, '', { 'X-RateLimit-Reset': String(resetAt) }))
      expect(hint.description).toContain('about 1 minute,')
    })

    it('falls back to a generic wait message when no usable header is present', () => {
      const hint = describeForgeError(fetchError(429, ''))
      expect(hint.description).toContain('try again shortly')
    })
  })
})

describe('isForgeRateLimit', () => {
  it('returns true for a 429', () => {
    expect(isForgeRateLimit(fetchError(429, ''))).toBe(true)
  })

  it('returns true for a 403 whose body mentions the rate limit', () => {
    expect(isForgeRateLimit(fetchError(403, 'API rate limit exceeded'))).toBe(true)
  })

  it('returns false for a plain 403 or other errors', () => {
    expect(isForgeRateLimit(fetchError(403, 'Resource not accessible'))).toBe(false)
    expect(isForgeRateLimit(fetchError(500, 'boom'))).toBe(false)
    expect(isForgeRateLimit(new Error('network down'))).toBe(false)
  })
})
