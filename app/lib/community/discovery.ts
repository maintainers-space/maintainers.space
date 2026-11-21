// Finds the Community of a forge owner with nothing but public atproto data.
//
// Constellation (constellation.microcosm.blue) indexes backlinks across the network, so asking it
// which `space.maintainers.community` records point at `https://github.com/nuxt` lists every
// claim. Anyone can write such a record, so each one is checked here before it counts:
//
//   1. Its proof shows the author may speak for the owner: their own attested forge account, a
//      keytrace.dev claim, a server-signed admin attestation, or, on Tangled, being the owner.
//   2. The author holds the community's protected Owner role, read from Colibri's AppView.
//
// The newest link that passes both wins, so moving to a new community is just writing a new link.
import { verifyClaim, type ClaimRecord } from '@keytrace/claims'
import { COMMUNITY_COLLECTION } from '#shared/atproto-oauth'
import type { ForgeAccountRecord } from '~/composables/useForgeAccounts'
import { verifyCommunityAdminAttestation, verifyForgeAttestation } from '~/lib/atproto/attestation'
import { getPublicRecord, resolveHandleToDid } from '~/lib/atproto/public'
import { communityGetData, type CommunityData } from './colibri'
import { communityDidOf, forgeOwnerUrl, type CommunityLinkRecord, type ForgeOwner } from './link'

const CONSTELLATION = 'https://constellation.microcosm.blue'

/** Forges keytrace.dev can prove an account on, by its claim type. */
const KEYTRACE_TYPES: Record<string, string> = { github: 'github', tangled: 'tangled' }

export interface CommunityLink {
  /** Who set the community up. */
  did: string
  uri: string
  record: CommunityLinkRecord
}

export interface ResolvedCommunity extends CommunityLink {
  data: CommunityData
}

interface Backlink {
  did: string
  collection: string
  rkey: string
}

function parseAtUri(uri: string): { did: string; collection: string; rkey: string } | undefined {
  const match = /^at:\/\/(did:[^/]+)\/([^/]+)\/([^/]+)$/.exec(uri)
  return match ? { collection: match[2]!, did: match[1]!, rkey: match[3]! } : undefined
}

function same(a: string | undefined, b: string | undefined): boolean {
  return (a ?? '').toLowerCase() === (b ?? '').toLowerCase()
}

/** Every link record that points at the owner, unverified. */
export async function findCommunityLinks(forge: ForgeOwner): Promise<CommunityLink[]> {
  const url = new URL('/links', CONSTELLATION)
  url.searchParams.set('target', forgeOwnerUrl(forge))
  url.searchParams.set('collection', COMMUNITY_COLLECTION)
  url.searchParams.set('path', '.forgeUrl')
  url.searchParams.set('limit', '50')
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Constellation answered ${res.status}`)
  const { linking_records: backlinks = [] } = (await res.json()) as { linking_records?: Backlink[] }
  const records = await Promise.all(
    backlinks.map((b) => getPublicRecord<CommunityLinkRecord>(b.did, b.collection, b.rkey))
  )
  return records.flatMap((r, i) =>
    r ? [{ did: backlinks[i]!.did, record: r.value, uri: r.uri }] : []
  )
}

/** Whether the link's proof shows its author may speak for the owner it names. */
export async function verifyProof(did: string, record: CommunityLinkRecord): Promise<boolean> {
  const { forge, proof } = record
  if (!proof || !forge) return false
  switch (proof.$type) {
    case 'space.maintainers.community#forgeAccountProof': {
      const at = parseAtUri(proof.uri)
      if (!at || at.did !== did || at.collection !== 'space.maintainers.forgeAccount') return false
      const account = await getPublicRecord<ForgeAccountRecord>(did, at.collection, at.rkey)
      if (!account) return false
      const { value } = account
      if (value.provider !== forge.provider || !same(value.username, forge.owner)) return false
      if (!same(value.host, forge.host)) return false
      return verifyForgeAttestation(value, did)
    }
    case 'space.maintainers.community#keytraceProof': {
      const type = KEYTRACE_TYPES[forge.provider]
      const at = parseAtUri(proof.uri)
      if (!type || forge.host || !at || at.did !== did || at.collection !== 'dev.keytrace.claim') {
        return false
      }
      const claim = await getPublicRecord<ClaimRecord>(did, at.collection, at.rkey)
      if (!claim || claim.value.type !== type || claim.value.retractedAt) return false
      if (!same(claim.value.identity?.subject, forge.owner)) return false
      try {
        const result = await verifyClaim({ claim: claim.value, did, rkey: at.rkey, uri: claim.uri })
        return result.verified
      } catch {
        return false
      }
    }
    case 'space.maintainers.community#adminAttestationProof':
      return verifyCommunityAdminAttestation(proof, did, forge)
    case 'space.maintainers.community#atprotoIdentityProof': {
      if (forge.provider !== 'tangled') return false
      try {
        return (await resolveHandleToDid(forge.owner)) === did
      } catch {
        return false
      }
    }
    default:
      return false
  }
}

/** Whether `did` holds the community's protected Owner role. */
export function ownsCommunity(data: CommunityData, did: string): boolean {
  const ownerRoles = new Set(data.roles.filter((r) => r.protected).map((r) => r.uri))
  const member = data.members.find((m) => m.did === did)
  return !!member?.roles?.some((role) => ownerRoles.has(role))
}

function newestFirst(a: CommunityLink, b: CommunityLink): number {
  const at = (l: CommunityLink) => l.record.updatedAt ?? l.record.createdAt ?? ''
  return at(b).localeCompare(at(a))
}

/** The owner's Community: the newest link that checks out, or `null` when there is none. */
export async function resolveCommunity(forge: ForgeOwner): Promise<ResolvedCommunity | null> {
  const links = (await findCommunityLinks(forge))
    .filter(
      (l) =>
        l.record.forge?.provider === forge.provider &&
        same(l.record.forge.owner, forge.owner) &&
        same(l.record.forge.host, forge.host) &&
        same(l.record.forgeUrl, forgeOwnerUrl(forge)) &&
        !!communityDidOf(l.record.community)
    )
    .toSorted(newestFirst)
  for (const link of links) {
    if (!(await verifyProof(link.did, link.record))) continue
    let data: CommunityData
    try {
      data = await communityGetData(link.record.community)
    } catch {
      continue
    }
    if (ownsCommunity(data, link.did)) return { ...link, data }
  }
  return null
}
