import {
  AuthenticationRequiredError,
  ForbiddenError,
  ForgeError,
  ForgeNetworkError,
  ForgeTimeoutError,
  InsufficientScopeError,
  NotFoundError,
  RateLimitedError,
  TokenRevokedError
} from 'forges'

export interface ForgeErrorHint {
  description?: string
  to?: string
  linkLabel?: string
}

/** True when `e` is a forge rate-limit response. */
export function isForgeRateLimit(e: unknown): boolean {
  return e instanceof RateLimitedError
}

/**
 * A user-facing hint for a `forges` error. An organisation's OAuth restriction gets a
 * self-service link to a repo-scoped token; a rate limit gets the reset ETA the forge reported.
 */
export function describeForgeError(
  e: unknown,
  locator?: { provider?: string; owner?: string; name?: string }
): ForgeErrorHint {
  const message = e instanceof Error ? e.message : (e as { message?: string })?.message

  if (e instanceof ForbiddenError && e.reason === 'org_restriction') {
    const link =
      locator?.provider && locator?.owner && locator?.name
        ? `/settings/accounts?${new URLSearchParams({ pat: `${locator.provider}:${locator.owner}/${locator.name}` })}`
        : '/settings/accounts'

    return {
      description:
        'This organization restricts third-party OAuth apps. To bypass this, you can provide a fine-grained Personal Access Token scoped strictly to this repository.',
      to: link,
      linkLabel: 'Provide a repo-scoped token'
    }
  }

  if (e instanceof RateLimitedError) {
    const minutes = e.resetAt ? Math.ceil((e.resetAt.getTime() - Date.now()) / 60_000) : 0
    const wait =
      minutes > 0
        ? `try again in about ${minutes} minute${minutes === 1 ? '' : 's'}`
        : 'try again shortly'
    return {
      description: `You've hit a rate limit — ${wait}, or connect an account in Settings for a much higher limit.`,
      to: '/settings/accounts',
      linkLabel: 'Connect an account'
    }
  }

  return { description: message }
}

/** The `forges` error behind `e`, which may be wrapped in the Nuxt error `useAsyncData` reports. */
function forgeErrorOf(e: unknown): ForgeError | undefined {
  if (e instanceof ForgeError) return e
  const cause = (e as { cause?: unknown } | null)?.cause
  return cause instanceof ForgeError ? cause : undefined
}

/**
 * One plain sentence for an error a page shows. `forges` errors name the request URL, which means
 * nothing to a reader (and is our own relay for some forges), so each kind gets its own wording.
 * Anything else keeps its message, since the app's own errors are already written for people.
 */
export function forgeErrorMessage(
  e: unknown,
  fallback = 'Something went wrong. Try again.'
): string {
  const forgeError = forgeErrorOf(e)
  if (!forgeError) {
    const { statusMessage, message } = (e ?? {}) as { statusMessage?: string; message?: string }
    return statusMessage || message || fallback
  }
  if (forgeError instanceof NotFoundError)
    return "This doesn't exist, or it's private and your connected account can't see it."
  if (forgeError instanceof RateLimitedError) return describeForgeError(forgeError).description!
  if (forgeError instanceof TokenRevokedError)
    return 'Your connection to this forge has expired. Reconnect it in Settings.'
  if (forgeError instanceof AuthenticationRequiredError)
    return 'This needs a connected account. Connect one in Settings.'
  if (forgeError instanceof InsufficientScopeError)
    return "Your connected account doesn't have permission for this. Reconnect it in Settings."
  if (forgeError instanceof ForbiddenError) return "You don't have access to this."
  if (forgeError instanceof ForgeTimeoutError)
    return 'The forge took too long to answer. Try again.'
  if (forgeError instanceof ForgeNetworkError)
    return "Couldn't reach the forge. Check your connection and try again."
  return fallback
}
