import type { ForgeOrigin, ForgeProvider, Forges } from 'forges'

import { createAppForges, createAppProvider } from '~/lib/forges/providers'
import type { ForgeCredentials } from '~/lib/forges/providers'
import { forgeIdOf, getForge } from '~/lib/forges/registry'

let memo: { forges: Forges; signature: string } | undefined
const overrides = new Map<string, ForgeProvider>()

/**
 * The shared `forges` registry, rebuilt whenever a token or the atproto session
 * changes (providers hold their credentials, so a new login needs a new
 * provider). Every component asks for the same instance until then.
 */
export function useForges() {
  const { tokens } = useForgeTokens()
  const { agent } = useAuth()

  const credentials = computed<ForgeCredentials>(() => ({
    atproto: agent.value
      ? {
          did: agent.value.sub,
          handle: (path, init) => agent.value!.handle(path, init),
          pds: agent.value.session.info.aud
        }
      : undefined,
    tokens: tokens.value
  }))

  const forges = computed(() => {
    const signature = JSON.stringify([credentials.value.tokens, credentials.value.atproto?.did])
    if (memo?.signature !== signature) {
      memo = { forges: createAppForges(credentials.value), signature }
      overrides.clear()
    }
    return memo.forges
  })

  /**
   * The provider a ref belongs to. A token saved for this exact repo wins over the
   * account-wide one, so a fine-grained token can be scoped to a single project.
   */
  function providerFor(
    ref: ForgeOrigin & { owner?: string; name?: string }
  ): ForgeProvider | undefined {
    const id = forgeIdOf(ref)
    const descriptor = getForge(id)
    if (!descriptor) return undefined
    const scoped =
      ref.owner && ref.name ? tokens.value[`${id}:${ref.owner}/${ref.name}`] : undefined
    if (!scoped) return forges.value.for(ref)
    const key = `${id}:${scoped}`
    let provider = overrides.get(key)
    if (!provider) {
      provider = createAppProvider(descriptor, credentials.value, scoped)
      overrides.set(key, provider)
    }
    return provider
  }

  /** Whether the viewer has connected an account on this ref's forge. */
  function isConnected(ref: ForgeOrigin): boolean {
    return ref.forge === 'tangled' ? !!agent.value : !!tokens.value[forgeIdOf(ref)]
  }

  return { forges, isConnected, providerFor }
}
