export interface ForgeErrorHint {
  description?: string
  to?: string
  linkLabel?: string
}

const GITHUB_OAUTH_RESTRICTION = /oauth app access restrictions/i

/**
 * Extracts a user-facing message from an ofetch-style error. GitHub's "OAuth App
 * access restrictions" 403 gets a clearer explanation plus a self-service link,
 * since the raw message otherwise just reads as an opaque permissions failure.
 */
export function describeForgeError(e: unknown): ForgeErrorHint {
  const raw =
    (e as { data?: { message?: string }; message?: string })?.data?.message ??
    (e as { message?: string })?.message

  if (raw && GITHUB_OAUTH_RESTRICTION.test(raw)) {
    return {
      description:
        "This organization restricts third-party apps and hasn't approved koinon yet. Ask an organization owner to approve it, or request access yourself.",
      to: 'https://github.com/settings/connections/applications',
      linkLabel: 'Open GitHub settings'
    }
  }

  return { description: raw }
}
