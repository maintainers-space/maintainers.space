import { communityCreate, channelCreate } from '~/lib/chat/colibri'
import { writeRepoBinding } from '~/lib/chat/repo-binding'
import type { ForgeId } from '~/types/forge'

export interface ChatOwnerRef {
  provider: ForgeId
  host?: string
  owner: string
}

const TEXT_CHANNEL_TYPE = 'social.colibri.channel.text'
const VOICE_CHANNEL_TYPE = 'social.colibri.channel.voice'

// communityCreate makes the first text channel itself, so 'general' is listed
// here only to mark the slot it occupies and is skipped when creating the rest.
const DEFAULT_CHANNELS: Array<{ name: string; type: string }> = [
  { name: 'general', type: TEXT_CHANNEL_TYPE },
  { name: 'off-topic', type: TEXT_CHANNEL_TYPE },
  { name: 'support', type: TEXT_CHANNEL_TYPE },
  { name: 'contributing', type: TEXT_CHANNEL_TYPE },
  { name: 'voice', type: VOICE_CHANNEL_TYPE }
]

/**
 * Nitro sends `createError({ statusMessage })` as the response body, and ofetch
 * parks that body on `error.data` while `error.message` is only ever the generic
 * "[POST] ...: 403 Forbidden". The server's refusals are the useful part here, so
 * prefer them.
 */
export function chatErrorMessage(e: unknown, fallback: string): string {
  const data = (e as { data?: { statusMessage?: string; message?: string } })?.data
  return data?.statusMessage || data?.message || (e instanceof Error ? e.message : fallback)
}

export interface CommunityPreview {
  communityDid: string
  communityUri: string
  ownerDid: string
  name?: string
}

interface MintAccountResponse {
  did: string
  handle: string
  pds: string
  identifier: string
  password: string
}

/**
 * Resolves (and, when nobody has yet, creates) the shared Colibri community
 * for a forge owner. One community per owner — every repo under that owner
 * shows the same channels, per the "org gets one chat, not one per repo"
 * design (see the chat feature plan).
 */
export function useChatCommunity(ownerRef: Ref<ChatOwnerRef | null>) {
  const { did } = useAuth()
  const { accounts, refresh: refreshAccounts, loaded: accountsLoaded } = useForgeAccounts()
  const forgeTokens = useForgeTokens()

  const communityUri = ref<string | null>(null)
  const pending = ref(false)
  const enabling = ref(false)
  const linking = ref(false)
  /** Failure to look the binding up, which replaces the whole panel. */
  const loadError = ref<string | null>(null)
  /** Failure of an enable/link attempt, which must leave the buttons reachable. */
  const error = ref<string | null>(null)

  // register-binding.post.ts is the authority on whether a binding is allowed:
  // it re-verifies the forge attestation and, for an org-owned repo, asks the
  // forge for the caller's role in that org. Nothing here re-implements those
  // rules, and deliberately so, because an earlier version gated the buttons on
  // useForgeAttestations().isVerified(), which is an async check that only trusts
  // attestations issued by the current origin, so an account attested on
  // production simply made the buttons vanish when running locally. The client's
  // job is to offer the action and report whatever the server says.
  const providerAccounts = computed(() => {
    const o = ownerRef.value
    if (!o) return []
    return accounts.value.filter((a) => a.provider === o.provider)
  })

  /**
   * The account whose attestation is sent, preferring an exact owner match.
   * Selected on the attestation being *present*, not on it verifying here.
   */
  const attestingAccount = computed(() => {
    const o = ownerRef.value
    if (!o) return null
    const attested = providerAccounts.value.filter((a) => a.attestation && a.attestedBy)
    return (
      attested.find((a) => a.username.toLowerCase() === o.owner.toLowerCase()) ??
      attested[0] ??
      null
    )
  })

  const isPersonalRepo = computed(() => {
    const o = ownerRef.value
    const account = attestingAccount.value
    return !!o && !!account && account.username.toLowerCase() === o.owner.toLowerCase()
  })

  const forgeToken = computed(() => {
    const o = ownerRef.value
    return o ? forgeTokens.get(o.provider) : undefined
  })

  /** A hint shown next to the buttons, never a gate. The server decides. */
  const needsForgeToken = computed(() => !isPersonalRepo.value && !forgeToken.value)

  const canEnable = computed(() => !!did.value && !!attestingAccount.value)

  /**
   * Linked on this provider, but no record carries an attestation, which is what
   * a link made while NUXT_ATTESTATION_PRIVATE_KEY was unset looks like. Worth
   * distinguishing, because "link an account" is wrong and confusing advice when
   * one is already linked, so it needs reconnecting for a signature to be minted.
   */
  const linkedButUnattested = computed(
    () => providerAccounts.value.length > 0 && !attestingAccount.value
  )

  async function loadCommunity(): Promise<void> {
    const o = ownerRef.value
    pending.value = true
    loadError.value = null
    communityUri.value = null
    try {
      if (!o) return
      const res = await $fetch<{ binding: { communityUri: string } | null }>(
        '/api/chat/community',
        {
          query: { provider: o.provider, host: o.host, owner: o.owner }
        }
      )
      if (!res.binding) return
      communityUri.value = res.binding.communityUri
    } catch (e) {
      loadError.value = chatErrorMessage(e, 'Could not load chat.')
    } finally {
      pending.value = false
    }
  }

  async function enableChat(): Promise<void> {
    const o = ownerRef.value
    if (!o || !did.value || !attestingAccount.value || enabling.value) return
    enabling.value = true
    error.value = null
    try {
      const minted = await $fetch<MintAccountResponse>('/api/chat/mint-account', {
        method: 'POST',
        body: { provider: o.provider, host: o.host, owner: o.owner }
      })

      await writeRepoBinding(minted.pds, minted.identifier, minted.password, [
        { provider: o.provider, host: o.host, owner: o.owner }
      ])

      const created = await communityCreate({
        name: o.owner,
        description: `Chat for ${o.owner} on maintainers.space`,
        requiresApprovalToJoin: false,
        pds: minted.pds,
        identifier: minted.identifier,
        password: minted.password
      })

      for (const channel of DEFAULT_CHANNELS.slice(1)) {
        await channelCreate({
          community: created.community,
          category: created.category,
          name: channel.name,
          type: channel.type
        })
      }

      await registerBinding(created.did)
      await loadCommunity()
    } catch (e) {
      error.value = chatErrorMessage(e, 'Could not enable chat.')
      throw e
    } finally {
      enabling.value = false
    }
  }

  /**
   * Points this owner's repo pages at an existing Colibri community the user
   * already runs. The server independently reads the community's protected Owner
   * role from its PDS and rejects the call unless the caller holds it, so the
   * ownership claim is never taken on trust from here.
   */
  async function linkCommunity(communityDid: string): Promise<void> {
    const trimmed = communityDid.trim()
    if (!trimmed || linking.value) return
    linking.value = true
    error.value = null
    try {
      await registerBinding(trimmed)
      await loadCommunity()
    } catch (e) {
      error.value = chatErrorMessage(e, 'Could not link that community.')
      throw e
    } finally {
      linking.value = false
    }
  }

  /** Read a community's name and owner so the UI can confirm before linking. */
  async function previewCommunity(communityDid: string): Promise<CommunityPreview> {
    return await $fetch<CommunityPreview>('/api/chat/resolve-community', {
      query: { did: communityDid.trim() }
    })
  }

  async function registerBinding(communityDid: string): Promise<void> {
    const o = ownerRef.value
    const account = attestingAccount.value
    if (!o || !did.value || !account) throw new Error('Chat cannot be enabled for this repo.')
    if (!account.attestation || !account.attestedBy) {
      throw new Error('Your linked account needs a verified attestation to enable chat.')
    }
    await $fetch('/api/chat/register-binding', {
      method: 'POST',
      headers: forgeToken.value ? { Authorization: `Bearer ${forgeToken.value}` } : undefined,
      body: {
        provider: o.provider,
        host: o.host,
        owner: o.owner,
        ownerDid: did.value,
        username: account.username,
        attestation: account.attestation,
        attestedBy: account.attestedBy,
        communityDid
      }
    })
  }

  watch(
    ownerRef,
    () => {
      loadCommunity()
    },
    { immediate: true }
  )

  watch(
    [did, accountsLoaded],
    async () => {
      if (did.value && !accountsLoaded.value) await refreshAccounts()
    },
    { immediate: true }
  )

  return {
    communityUri,
    pending,
    enabling,
    linking,
    loadError,
    error,
    canEnable,
    needsForgeToken,
    isPersonalRepo,
    linkedButUnattested,
    hasLinkedAccount: computed(() => !!attestingAccount.value),
    enableChat,
    linkCommunity,
    previewCommunity,
    refresh: loadCommunity
  }
}
