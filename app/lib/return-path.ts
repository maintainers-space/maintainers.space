// Where to land after an OAuth round trip. The redirect leaves the SPA entirely, so in-memory
// state is gone by the time the callback page runs, and the callback URL's own parameters belong
// to the authorization response; sessionStorage survives the trip and stays with the tab.
const RETURN_TO_KEY = 'maintainers.space:oauth-return-to'

/** An in-app path, or `undefined` for anything that could leave the site (`//host`, `/\host`, URLs). */
export function safeReturnPath(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.startsWith('/')) return undefined
  if (value.startsWith('//') || value.startsWith('/\\')) return undefined
  return value
}

export function rememberReturnPath(path: unknown): void {
  const safe = safeReturnPath(path)
  try {
    if (safe) sessionStorage.setItem(RETURN_TO_KEY, safe)
    else sessionStorage.removeItem(RETURN_TO_KEY)
  } catch {
    /* storage unavailable: the callback falls back to the home page */
  }
}

/** Reads and forgets the stored path, so a later sign-in never reuses it. */
export function consumeReturnPath(): string | undefined {
  try {
    const path = sessionStorage.getItem(RETURN_TO_KEY)
    sessionStorage.removeItem(RETURN_TO_KEY)
    return safeReturnPath(path)
  } catch {
    return undefined
  }
}
