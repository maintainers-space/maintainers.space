import { ForbiddenError, ForgeNetworkError, NotFoundError, RateLimitedError } from 'forges'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { describeForgeError, forgeErrorMessage, isForgeRateLimit } from './forge-errors'

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

describe('forgeErrorMessage', () => {
  const notFound = new NotFoundError(
    'Nothing found at GET http://127.0.0.1:3000/api/tangled/xrpc/sh.tangled.repo.tree?repo=at%3A%2F%2Fdid, or the credential cannot see it',
    404,
    ''
  )

  it('never shows the request URL of a missing resource', () => {
    const message = forgeErrorMessage(notFound)
    expect(message).toBe(
      "This doesn't exist, or it's private and your connected account can't see it."
    )
    expect(message).not.toContain('http')
  })

  it('reads the forge error behind the Nuxt error that useAsyncData reports', () => {
    const wrapped = Object.assign(new Error(notFound.message), {
      cause: notFound,
      statusMessage: notFound.message
    })
    expect(forgeErrorMessage(wrapped)).not.toContain('http')
  })

  it('tells people when the forge could not be reached', () => {
    const error = new ForgeNetworkError('fetch failed: GET https://api.github.com/repos/a/b')
    expect(forgeErrorMessage(error)).toBe(
      "Couldn't reach the forge. Check your connection and try again."
    )
  })

  it('keeps the messages the app writes itself', () => {
    expect(forgeErrorMessage(new Error('You appear to be offline.'), 'Fallback')).toBe(
      'You appear to be offline.'
    )
    expect(forgeErrorMessage({ statusMessage: 'Repository "x" was not found.' })).toBe(
      'Repository "x" was not found.'
    )
  })

  it('falls back when there is nothing to show', () => {
    expect(forgeErrorMessage(null, 'Failed to load issues.')).toBe('Failed to load issues.')
  })
})
