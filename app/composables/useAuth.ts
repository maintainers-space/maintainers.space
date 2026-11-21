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
import { OAUTH_SCOPE } from '#shared/atproto-oauth'
import { fetchPublicProfile } from '~/lib/atproto/public'
import { clearCache } from '~/lib/cache'
import { rememberReturnPath } from '~/lib/return-path'
import { resetForgeAccounts } from '~/composables/useForgeAccounts'
import { clearForgeTokens } from '~/composables/useForgeTokens'
import { clearOfflineState } from '~/composables/useOfflineRepos'

const CURRENT_DID_KEY = 'maintainers.space:current-did'

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
  // account's cached repos/issues/notifications, nor its offline pinning/watched
  // state (which would leak which repos/issues the previous account followed),
  // nor its forge tokens and linked accounts.
  clearCache()
  clearOfflineState()
  clearForgeTokens()
  resetForgeAccounts()
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
   * The scope the PDS actually granted, which is not the scope that was requested: `include:`
   * permission sets come back expanded into the permissions they cover. Anything deciding whether a
   * feature may run has to read this rather than what was asked for.
   */
  const grantedScope = computed(() => _agent.value?.session.token.scope)

  /** Kick off the OAuth redirect flow for a given handle or DID, returning to `returnTo` afterwards. */
  async function loginWithHandle(identifier: string, returnTo?: string): Promise<void> {
    const clean = identifier.trim().replace(/^@/, '')
    if (!clean) throw new Error('Please enter a handle or DID.')
    rememberReturnPath(returnTo)
    const url = await createAuthorizationUrl({
      target: { type: 'account', identifier: clean as ActorIdentifier },
      scope: OAUTH_SCOPE
    })
    // Give freshly-stored PKCE/DPoP state a tick to persist before navigating away.
    await new Promise((resolve) => setTimeout(resolve, 200))
    window.location.assign(url.toString())
  }

  /**
   * Re-runs authorization for the account that is already signed in, so the session picks up
   * scopes it does not hold yet. The identity carries over, so nobody re-enters their handle, and
   * abandoning the consent screen keeps the current session.
   */
  async function requestScopes(scope: string, returnTo?: string): Promise<void> {
    const sub = _did.value
    if (!sub) throw new Error('Not authenticated')
    rememberReturnPath(returnTo)
    const url = await createAuthorizationUrl({
      target: { type: 'account', identifier: sub as ActorIdentifier },
      scope
    })
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
    // shallowReadonly: a deep `readonly()` proxy would hand out a Proxy around OAuthUserAgent,
    // whose methods read `#private` fields that a Proxy cannot reach.
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
