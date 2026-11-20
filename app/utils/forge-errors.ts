import { ForbiddenError, RateLimitedError } from 'forges'

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
