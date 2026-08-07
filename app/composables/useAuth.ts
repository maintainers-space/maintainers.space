import { Client } from '@atcute/client'
import {
  OAuthUserAgent,
  TokenRefreshError,
  createAuthorizationUrl,
  deleteStoredSession,
  finalizeAuthorization,
  getSession,
  listStoredSessions
} from '@atcute/oauth-browser-client'
import type { ActorIdentifier, Did } from '@atcute/lexicons'
import { getBaseScope } from '~/lib/atproto/oauth'
import { fetchPublicProfile } from '~/lib/atproto/public'
import { clearCache } from '~/lib/cache'

const CURRENT_DID_KEY = 'maintainers.space:current-did'
const RETURN_TO_KEY = 'maintainers.space:oauth-return-to'

/**
 * Where to land once an OAuth round trip finishes, read and cleared by
 * `pages/oauth/callback.vue`. sessionStorage rather than a ref or the URL: the
 * redirect leaves the SPA entirely, so in-memory state does not survive, and the
 * callback URL's own params are reserved for the authorization response.
 */
export function consumeReturnPath(): string | null {
  if (!import.meta.client) return null
  const path = sessionStorage.getItem(RETURN_TO_KEY)
  if (path) sessionStorage.removeItem(RETURN_TO_KEY)
  return path
}

export interface AtpProfile {
  did: string
  handle: string
  displayName?: string
  avatar?: string
  description?: string
}

const _agent = shallowRef<OAuthUserAgent | null>(null)
const _did = ref<string | null>(null)
const _profile = ref<AtpProfile | null>(null)
const _restoring = ref(true)

async function activate(agent: OAuthUserAgent): Promise<void> {
  _agent.value = agent
  _did.value = agent.sub
  if (import.meta.client) localStorage.setItem(CURRENT_DID_KEY, agent.sub)
  // Auth state is live immediately; enrich the profile in the background so a
  // slow identity/profile lookup never blocks app boot or first paint.
  if (!_profile.value || _profile.value.did !== agent.sub) {
    _profile.value = { did: agent.sub, handle: agent.sub }
  }
  void fetchPublicProfile(agent.sub)
    .then((p) => {
      _profile.value = p
    })
    .catch(() => {
      /* keep the did-as-handle fallback */
    })
}

/** Tear down local session state and drop the stored session for `sub`. */
function clearLocalSession(sub?: Did | null): void {
  _agent.value = null
  _did.value = null
  _profile.value = null
  // So another account signing in on the same device never reads this
  // account's cached repos/issues/notifications.
  clearCache()
  const dead =
    sub ?? (import.meta.client ? (localStorage.getItem(CURRENT_DID_KEY) as Did | null) : null)
  if (dead) {
    try {
      deleteStoredSession(dead)
    } catch {
      /* ignore */
    }
  }
  if (import.meta.client) localStorage.removeItem(CURRENT_DID_KEY)
}

/** True when an error means the atproto session is permanently dead (revoked/expired). */
export function isSessionExpired(err: unknown): boolean {
  return err instanceof TokenRefreshError
}

/**
 * Validate/refresh the stored token in the background. Only a *definitively*
 * dead session (revoked or expired refresh token) tears the session down;
 * transient/offline errors are ignored so the user stays logged in.
 */
async function revalidateSession(sub: Did): Promise<void> {
  try {
    await getSession(sub, { allowStale: false })
  } catch (err) {
    if (err instanceof TokenRefreshError) clearLocalSession(sub)
  }
}

export function useAuth() {
  const isAuthenticated = computed(() => !!_agent.value)

  /**
   * The scope the PDS actually granted, which is not the scope that was
   * requested: `include:` permission sets come back expanded into the concrete
   * permissions they cover. Anything deciding whether a feature may run has to
   * read this rather than reconstruct what was asked for.
   */
  const grantedScope = computed(() => _agent.value?.session.token.scope)

  /** Kick off the OAuth redirect flow for a given handle or DID. */
  async function loginWithHandle(identifier: string): Promise<void> {
    const clean = identifier.trim().replace(/^@/, '')
    if (!clean) throw new Error('Please enter a handle or DID.')
    const url = await createAuthorizationUrl({
      target: { type: 'account', identifier: clean as ActorIdentifier },
      scope: getBaseScope()
    })
    // Give freshly-stored PKCE/DPoP state a tick to persist before navigating away.
    await new Promise((resolve) => setTimeout(resolve, 200))
    window.location.assign(url.toString())
  }

  /**
   * Re-run authorization for the account that is already signed in, so a session
   * can pick up scopes it does not hold yet. Unlike signing out and back in, the
   * identity is carried over, so the user neither re-enters their handle nor
   * loses the current session if they abandon the consent screen.
   */
  async function requestScopes(scope: string, returnTo?: string): Promise<void> {
    const sub = _did.value
    if (!sub) throw new Error('Not authenticated')
    if (returnTo && import.meta.client) sessionStorage.setItem(RETURN_TO_KEY, returnTo)
    const url = await createAuthorizationUrl({
      target: { type: 'account', identifier: sub as ActorIdentifier },
      scope
    })
    // Give freshly-stored PKCE/DPoP state a tick to persist before navigating away.
    await new Promise((resolve) => setTimeout(resolve, 200))
    window.location.assign(url.toString())
  }

  /** Finalize the OAuth flow from the callback fragment params. */
  async function completeCallback(): Promise<void> {
    const params = new URLSearchParams(location.hash.slice(1))
    history.replaceState(null, '', location.pathname)
    const { session } = await finalizeAuthorization(params)
    await activate(new OAuthUserAgent(session))
  }

  /** Restore a previously-stored session (called on app boot). */
  async function restore(): Promise<void> {
    _restoring.value = true
    try {
      const dids = listStoredSessions()
      if (!dids.length) return
      const stored = localStorage.getItem(CURRENT_DID_KEY) as Did | null
      const target = (stored && dids.includes(stored) ? stored : dids[0]) as Did
      // allowStale → instant restore straight from localStorage, no network.
      const session = await getSession(target, { allowStale: true })
      await activate(new OAuthUserAgent(session))
      void revalidateSession(target)
    } catch (err) {
      // Only a revoked/expired refresh token clears the session. Transient
      // errors keep it so the next boot can retry — no weekly re-login.
      if (err instanceof TokenRefreshError) clearLocalSession(err.sub)
    } finally {
      _restoring.value = false
    }
  }

  async function logout(): Promise<void> {
    const agent = _agent.value
    const sub = _did.value as Did | null
    try {
      if (agent) await agent.signOut()
    } catch {
      /* best effort — fall through to local cleanup */
    }
    clearLocalSession(sub)
  }

  /** Authenticated XRPC client bound to the current session (DPoP-signed). */
  function client(): Client {
    if (!_agent.value) throw new Error('Not authenticated')
    return new Client({ handler: _agent.value })
  }

  /**
   * Run an authenticated XRPC call. If the session's refresh token is dead the
   * user is signed out and a friendly error is surfaced; other errors bubble up.
   */
  async function runAuthed<T>(fn: (rpc: Client) => Promise<T>): Promise<T> {
    try {
      return await fn(client())
    } catch (err) {
      if (err instanceof TokenRefreshError) {
        await logout()
        throw new Error('Your session expired. Please sign in again.', { cause: err })
      }
      throw err
    }
  }

  return {
    // shallowReadonly, not readonly: `readonly()` is a deep runtime proxy, so
    // `.value` would hand out a Proxy wrapping OAuthUserAgent rather than the
    // instance. Its methods read `#private` fields, and a private field cannot be
    // reached through a Proxy, so every call would fail with "can't access
    // private field or method: object is not the right class". This still blocks
    // assigning `.value`, which is all the readonly wrapper was for.
    agent: shallowReadonly(_agent),
    did: readonly(_did),
    profile: readonly(_profile),
    restoring: readonly(_restoring),
    isAuthenticated,
    grantedScope,
    loginWithHandle,
    requestScopes,
    completeCallback,
    restore,
    logout,
    client,
    runAuthed
  }
}
