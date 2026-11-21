import { ok } from '@atcute/client'
import type { Did, Nsid } from '@atcute/lexicons'
import { getClaimsForDid } from '@keytrace/claims'
import { getMissingScopeSets } from '@colibri-social/client/scopes'
import { COMMUNITY_COLLECTION, communityScope } from '#shared/atproto-oauth'
import { verifyForgeAttestation } from '~/lib/atproto/attestation'
import { resolveHandleToDid } from '~/lib/atproto/public'
import { communityGetData } from '~/lib/community/colibri'
import { resolveCommunity, type ResolvedCommunity } from '~/lib/community/discovery'
import {
  communityRkey,
  forgeLabel,
  forgeOwnerUrl,
  type CommunityLinkRecord,
  type CommunityProof,
  type ForgeOwner
} from '~/lib/community/link'

/**
 * The Community of a forge owner, found and verified from public atproto data. `null` when the
 * owner has none yet.
 */
export function useCommunity(forge: MaybeRefOrGetter<ForgeOwner | undefined>) {
  const { did } = useAuth()
  const key = computed(() => {
    const f = toValue(forge)
    return f ? `community:${f.provider}:${f.host ?? ''}:${f.owner.toLowerCase()}` : 'community:none'
  })
  const { data, pending, error, refresh } = useAsyncData<ResolvedCommunity | null>(
    key,
    async () => {
      const f = toValue(forge)
      return f ? resolveCommunity(f) : null
    },
    { default: () => null, lazy: true, server: false }
  )

  /** Whether the viewer set this community up, and so may sync it. */
  const isManager = computed(() => !!did.value && data.value?.did === did.value)

  /**
   * Shows a community this session just set up. Constellation takes a moment to index the new
   * link, so it isn't looked up again right away.
   */
  function show(community: ResolvedCommunity): void {
    data.value = community
  }

  /** Fetches the community's current layout again, e.g. after a sync. */
  async function reload(): Promise<void> {
    if (!data.value) return refresh()
    data.value = { ...data.value, data: await communityGetData(data.value.record.community) }
  }

  return { community: data, error, isManager, pending, refresh, reload, show }
}

/** Whether this session may use Community, and how to ask for what it lacks. */
export function useCommunityAccess() {
  const { grantedScope, isAuthenticated, requestScopes } = useAuth()
  const scope = computed(() => communityScope(useRuntimeConfig().public.colibriAppviewUrl))

  const missing = computed(() => {
    const granted = grantedScope.value
    if (!granted) return ['session']
    const sets = getMissingScopeSets(granted)
    if (!granted.split(' ').includes(`repo:${COMMUNITY_COLLECTION}`))
      sets.push(COMMUNITY_COLLECTION)
    return sets
  })
  const hasAccess = computed(() => isAuthenticated.value && missing.value.length === 0)

  function grant(returnTo?: string): Promise<void> {
    return requestScopes(scope.value, returnTo)
  }

  return { grant, hasAccess, missing }
}

export class CommunityProofError extends Error {}

/**
 * Finds why the viewer may set up a Community for `forge`, cheapest proof first: being the owner
 * on Tangled, an attested forge account of their own, a keytrace.dev claim, and for an
 * organisation, the server asking the forge whether they administer it.
 */
export function useCommunityProof() {
  const { did } = useAuth()
  const { accounts, loaded, refresh } = useForgeAccounts()
  const { get: forgeToken } = useForgeTokens()

  async function prove(forge: ForgeOwner): Promise<CommunityProof> {
    const viewer = did.value
    if (!viewer) throw new CommunityProofError('Sign in to set up a Community.')
    const label = forgeLabel(forge.provider)
    const sameName = (a?: string) => (a ?? '').toLowerCase() === forge.owner.toLowerCase()

    if (forge.provider === 'tangled') {
      const ownerDid = await resolveHandleToDid(forge.owner).catch(() => undefined)
      if (ownerDid === viewer) return { $type: 'space.maintainers.community#atprotoIdentityProof' }
      throw new CommunityProofError(`Only ${forge.owner} can set up their Community on Tangled.`)
    }

    if (!loaded.value) await refresh()
    const own = accounts.value.filter(
      (a) => a.provider === forge.provider && (a.host ?? '') === (forge.host ?? '')
    )
    for (const account of own.filter((a) => sameName(a.username))) {
      if (await verifyForgeAttestation(account, viewer)) {
        return { $type: 'space.maintainers.community#forgeAccountProof', uri: account.uri }
      }
    }

    if (!forge.host && ['github', 'tangled'].includes(forge.provider)) {
      const claims = await getClaimsForDid(viewer).catch(() => undefined)
      const claim = claims?.claims.find(
        (c) => c.verified && c.claim.type === forge.provider && sameName(c.identity.subject)
      )
      if (claim) return { $type: 'space.maintainers.community#keytraceProof', uri: claim.uri }
    }

    // Not the viewer's own account, so it has to be an organisation they administer.
    const attested = []
    for (const account of own) {
      if (account.attestation && (await verifyForgeAttestation(account, viewer)))
        attested.push(account)
    }
    const account = attested[0]
    const token = forgeToken(forge.provider)
    if (!account || !token) {
      throw new CommunityProofError(
        `Connect your ${label} account in Settings first, so maintainers.space can check that you administer ${forge.owner}.`
      )
    }
    try {
      const signed = await $fetch<{ attestation: string; attestedBy: string }>(
        '/api/community/admin-attestation',
        {
          body: {
            attestation: account.attestation,
            attestedBy: account.attestedBy,
            did: viewer,
            host: forge.host,
            owner: forge.owner,
            provider: forge.provider,
            username: account.username
          },
          headers: { authorization: `Bearer ${token}` },
          method: 'POST'
        }
      )
      return { $type: 'space.maintainers.community#adminAttestationProof', ...signed }
    } catch (e) {
      const message = (e as { data?: { statusMessage?: string } }).data?.statusMessage
      throw new CommunityProofError(message ?? `Could not check your role in ${forge.owner}.`)
    }
  }

  return { prove }
}

/** Writes the link from the forge owner to its community into the viewer's own repo. */
export async function writeCommunityLink(
  forge: ForgeOwner,
  community: string,
  proof: CommunityProof,
  createdAt?: string
): Promise<{ uri: string; record: CommunityLinkRecord }> {
  const { did, runAuthed } = useAuth()
  const viewer = did.value
  if (!viewer) throw new Error('Not authenticated')
  const now = new Date().toISOString()
  const record: CommunityLinkRecord = {
    $type: COMMUNITY_COLLECTION,
    community,
    createdAt: createdAt ?? now,
    forge: forge.host ? forge : { owner: forge.owner, provider: forge.provider },
    forgeUrl: forgeOwnerUrl(forge),
    proof,
    updatedAt: now
  }
  const written = await runAuthed((rpc) =>
    ok(
      rpc.post('com.atproto.repo.putRecord', {
        input: {
          collection: COMMUNITY_COLLECTION as Nsid,
          record: record as unknown as Record<string, unknown>,
          repo: viewer as Did,
          rkey: communityRkey(forge),
          // Our lexicons aren't published on-network, so the PDS can't validate against them.
          validate: false
        }
      })
    )
  )
  return { record, uri: written.uri }
}
