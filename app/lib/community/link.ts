// The `space.maintainers.community` record, which links a forge owner to its Colibri community.
// It lives in the repo of whoever set the community up, and Constellation indexes it by
// `forgeUrl`, so anyone can find an owner's community without a server of ours keeping a list.
import { COMMUNITY_COLLECTION } from '#shared/atproto-oauth'
import { makeRkey } from '~/composables/useForgeAccounts'
import { getForge, ownerWebUrl } from '~/lib/forges/registry'

export type CommunityProof =
  | { $type: 'space.maintainers.community#forgeAccountProof'; uri: string }
  | { $type: 'space.maintainers.community#keytraceProof'; uri: string }
  | {
      $type: 'space.maintainers.community#adminAttestationProof'
      attestation: string
      attestedBy: string
    }
  | { $type: 'space.maintainers.community#atprotoIdentityProof' }

export interface ForgeOwner {
  provider: string
  owner: string
  /** Only for self-hosted instances, as in forge-account records. */
  host?: string
}

export interface CommunityLinkRecord {
  $type: typeof COMMUNITY_COLLECTION
  forge: ForgeOwner
  forgeUrl: string
  community: string
  proof: CommunityProof
  createdAt: string
  updatedAt?: string
}

/** The owner's page on its forge, lowercased so every link to it is found by the same key. */
export function forgeOwnerUrl(forge: ForgeOwner): string {
  const url = forge.host
    ? `https://${forge.host}/${forge.owner}`
    : ownerWebUrl(forge.provider, forge.owner)
  if (!url) throw new Error(`Unknown forge "${forge.provider}"`)
  return url.toLowerCase()
}

/** One link per owner per account, so setting it up again replaces the old one. */
export function communityRkey(forge: ForgeOwner): string {
  return makeRkey(forge.provider, forge.owner, forge.host)
}

/** The AT-URI of a community, which is a `literal:self` singleton in its own repo. */
export function communityUri(did: string): string {
  return `at://${did}/social.colibri.community/self`
}

export function communityDidOf(uri: string): string | undefined {
  return /^at:\/\/(did:[^/]+)\/social\.colibri\.community\/self$/.exec(uri)?.[1]
}

export function forgeLabel(provider: string): string {
  return getForge(provider)?.label ?? provider
}
