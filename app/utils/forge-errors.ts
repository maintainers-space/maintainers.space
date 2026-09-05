export interface ForgeErrorHint {
  description?: string
  to?: string
  linkLabel?: string
}

const GITHUB_OAUTH_RESTRICTION = /oauth app access restrictions/i
const RATE_LIMIT_MESSAGE = /rate limit/i

function statusOf(e: unknown): number | undefined {
  const err = e as { response?: { status?: number }; statusCode?: number; status?: number }
  return err.response?.status ?? err.statusCode ?? err.status
}

function headersOf(e: unknown): Headers | undefined {
  return (e as { response?: { headers?: Headers } })?.response?.headers
}

/** True when `e` is a forge rate-limit response (429, or a 403 whose body says "rate limit"). */
export function isForgeRateLimit(e: unknown): boolean {
  const raw =
    (e as { data?: { message?: string }; message?: string })?.data?.message ??
    (e as { message?: string })?.message
  return statusOf(e) === 429 || (statusOf(e) === 403 && !!raw && RATE_LIMIT_MESSAGE.test(raw))
}

/** Minutes from now until a rate limit resets, from whichever header the forge sent. */
function minutesUntilReset(headers: Headers | undefined): number | undefined {
  if (!headers) return undefined

  // GitHub (`X-RateLimit-Reset`) and GitLab (`RateLimit-Reset`) both send a unix timestamp (seconds).
  const resetAt = headers.get('x-ratelimit-reset') ?? headers.get('ratelimit-reset')
  if (resetAt) {
    const seconds = Number(resetAt)
    if (Number.isFinite(seconds)) {
      const minutes = Math.ceil((seconds * 1000 - Date.now()) / 60_000)
      if (minutes > 0) return minutes
    }
  }

  // `Retry-After` (Bitbucket, and a generic fallback) is either delta-seconds or an HTTP-date.
  const retryAfter = headers.get('retry-after')
  if (retryAfter) {
    const seconds = Number(retryAfter)
    if (Number.isFinite(seconds)) {
      const minutes = Math.ceil(seconds / 60)
      if (minutes > 0) return minutes
    } else {
      const at = Date.parse(retryAfter)
      if (!Number.isNaN(at)) {
        const minutes = Math.ceil((at - Date.now()) / 60_000)
        if (minutes > 0) return minutes
      }
    }
  }

  return undefined
}

/**
 * Extracts a user-facing message from an ofetch-style error. GitHub's "OAuth App
 * access restrictions" 403 gets a clearer explanation plus a self-service link,
 * since the raw message otherwise just reads as an opaque permissions failure.
 * A 429 (or a 403 whose body says "rate limit") gets an actionable message with
 * the reset ETA when the forge's response headers provide one.
 */
export function describeForgeError(e: unknown): ForgeErrorHint {
  const raw =
    (e as { data?: { message?: string }; message?: string })?.data?.message ??
    (e as { message?: string })?.message

  if (raw && GITHUB_OAUTH_RESTRICTION.test(raw)) {
    return {
      description:
        "This organization restricts third-party apps and hasn't approved maintainers.space yet. Ask an organization owner to approve it, or request access yourself.",
      to: 'https://github.com/settings/connections/applications',
      linkLabel: 'Open GitHub settings'
    }
  }

  const status = statusOf(e)
  const isRateLimit = status === 429 || (status === 403 && !!raw && RATE_LIMIT_MESSAGE.test(raw))
  if (isRateLimit) {
    const minutes = minutesUntilReset(headersOf(e))
    const wait = minutes
      ? `try again in about ${minutes} minute${minutes === 1 ? '' : 's'}`
      : 'try again shortly'
    return {
      description: `You've hit a rate limit — ${wait}, or connect an account in Settings for a much higher limit.`,
      to: '/settings/accounts',
      linkLabel: 'Connect an account'
    }
  }

  return { description: raw }
}
