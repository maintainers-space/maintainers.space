import {
  communityCreate,
  channelCreate,
  communityGetData,
  type CommunityData
} from '~/lib/chat/colibri'
import { writeRepoBinding } from '~/lib/chat/repo-binding'
import type { ForgeId } from '~/types/forge'

export interface ChatOwnerRef {
  provider: ForgeId
  host?: string
  owner: string
}

const DEFAULT_CHANNELS = ['general', 'off-topic', 'support', 'contributing']

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
  const { isVerified, check: checkAttestations } = useForgeAttestations()

  const communityUri = ref<string | null>(null)
  const community = ref<CommunityData | null>(null)
  const pending = ref(false)
  const enabling = ref(false)
  const error = ref<string | null>(null)

  // v1 gate: chat can only be enabled for the owner matching your own verified
  // linked forge account (personal repos). Org-repo admin verification isn't
  // implemented yet — see register-binding.post.ts.
  const matchingAccount = computed(() => {
    const o = ownerRef.value
    if (!o) return null
    return (
      accounts.value.find(
        (a) => a.provider === o.provider && a.username.toLowerCase() === o.owner.toLowerCase()
      ) ?? null
    )
  })

  const canEnable = computed(
    () => !!did.value && !!matchingAccount.value && isVerified(did.value, matchingAccount.value)
  )

  async function loadCommunity(): Promise<void> {
    const o = ownerRef.value
    pending.value = true
    error.value = null
    community.value = null
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
      community.value = await communityGetData(res.binding.communityUri)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Could not load chat.'
    } finally {
      pending.value = false
    }
  }

  async function enableChat(): Promise<void> {
    const o = ownerRef.value
    const account = matchingAccount.value
    if (!o || !did.value || !account || enabling.value) return
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

      const extraChannels = DEFAULT_CHANNELS.slice(1)
      for (const name of extraChannels) {
        await channelCreate({
          community: created.community,
          category: created.category,
          name,
          type: 'social.colibri.channel.text'
        })
      }

      if (!account.attestation || !account.attestedBy) {
        throw new Error('Your linked account needs a verified attestation to enable chat.')
      }
      await $fetch('/api/chat/register-binding', {
        method: 'POST',
        body: {
          provider: o.provider,
          host: o.host,
          owner: o.owner,
          ownerDid: did.value,
          username: account.username,
          attestation: account.attestation,
          attestedBy: account.attestedBy,
          communityDid: created.did,
          communityUri: created.community
        }
      })

      await loadCommunity()
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Could not enable chat.'
      throw e
    } finally {
      enabling.value = false
    }
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
      if (!accountsLoaded.value) await refreshAccounts()
      await checkAttestations(did.value, accounts.value)
    },
    { immediate: true }
  )

  return {
    community,
    communityUri,
    pending,
    enabling,
    error,
    canEnable,
    enableChat,
    refresh: loadCommunity
  }
}
