import { Client } from '@atcute/client'
import {
  OAuthUserAgent,
  createAuthorizationUrl,
  deleteStoredSession,
  finalizeAuthorization,
  getSession,
  listStoredSessions
} from '@atcute/oauth-browser-client'
import type { ActorIdentifier, Did } from '@atcute/lexicons'
import { OAUTH_SCOPE } from '~/lib/atproto/oauth'
import { fetchPublicProfile } from '~/lib/atproto/public'

const CURRENT_DID_KEY = 'koinon:current-did'

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
  try {
    _profile.value = await fetchPublicProfile(agent.sub)
  } catch {
    _profile.value = { did: agent.sub, handle: agent.sub }
  }
}

export function useAuth() {
  const isAuthenticated = computed(() => !!_agent.value)

  /** Kick off the OAuth redirect flow for a given handle or DID. */
  async function loginWithHandle(identifier: string): Promise<void> {
    const clean = identifier.trim().replace(/^@/, '')
    if (!clean) throw new Error('Please enter a handle or DID.')
    const url = await createAuthorizationUrl({
      target: { type: 'account', identifier: clean as ActorIdentifier },
      scope: OAUTH_SCOPE
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
      const session = await getSession(target, { allowStale: true })
      await activate(new OAuthUserAgent(session))
    } catch {
      const stale = localStorage.getItem(CURRENT_DID_KEY) as Did | null
      if (stale) {
        try { deleteStoredSession(stale) } catch { /* ignore */ }
      }
      localStorage.removeItem(CURRENT_DID_KEY)
    } finally {
      _restoring.value = false
    }
  }

  async function logout(): Promise<void> {
    const agent = _agent.value
    try {
      if (agent) await agent.signOut()
    } catch {
      if (_did.value) {
        try { deleteStoredSession(_did.value as Did) } catch { /* ignore */ }
      }
    }
    if (import.meta.client) localStorage.removeItem(CURRENT_DID_KEY)
    _agent.value = null
    _did.value = null
    _profile.value = null
  }

  /** Authenticated XRPC client bound to the current session (DPoP-signed). */
  function client(): Client {
    if (!_agent.value) throw new Error('Not authenticated')
    return new Client({ handler: _agent.value })
  }

  return {
    agent: readonly(_agent),
    did: readonly(_did),
    profile: readonly(_profile),
    restoring: readonly(_restoring),
    isAuthenticated,
    loginWithHandle,
    completeCallback,
    restore,
    logout,
    client
  }
}
