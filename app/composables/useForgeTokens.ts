// Optional, clearly-scoped personal access tokens for forge APIs.
//
// maintainers.space works fully unauthenticated; a token is only ever used to unlock extra
// provider features (e.g. GitHub code search, higher rate limits). Tokens live in
// localStorage on the user's device and are never sent anywhere but the forge.

import type { ForgeId } from '~/types/forge'
import { syncForgeTokens } from '~/lib/forges/token-store'

const STORAGE_PREFIX = 'maintainers.space:forge-token:'

const _tokens = ref<Record<string, string>>({})
let _loaded = false

function load(): void {
  if (_loaded || !import.meta.client) return
  const out: Record<string, string> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith(STORAGE_PREFIX)) {
      const val = localStorage.getItem(key)
      if (val) out[key.slice(STORAGE_PREFIX.length)] = val
    }
  }
  _tokens.value = out
  syncForgeTokens(out)
  _loaded = true
}

export function useForgeTokens() {
  load()

  function get(provider: ForgeId): string | undefined {
    return _tokens.value[provider] || undefined
  }

  function set(provider: ForgeId, token: string): void {
    const clean = token.trim()
    if (!clean) return remove(provider)
    localStorage.setItem(STORAGE_PREFIX + provider, clean)
    _tokens.value = { ..._tokens.value, [provider]: clean }
    syncForgeTokens(_tokens.value)
  }

  function remove(provider: ForgeId): void {
    localStorage.removeItem(STORAGE_PREFIX + provider)
    const next = { ..._tokens.value }
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete next[provider]
    _tokens.value = next
    syncForgeTokens(next)
  }

  return { tokens: readonly(_tokens), get, set, remove }
}
