export const COMMUNITY_COLLECTION = 'social.colibri.community'
const ROLE_COLLECTION = 'social.colibri.role'
const MEMBER_COLLECTION = 'social.colibri.member'

const MEMBER_PAGE_SIZE = 100
const MAX_MEMBER_PAGES = 10

interface RoleRecord {
  name?: string
  protected?: boolean
}

interface MemberRecord {
  subject?: string
  roles?: string[]
}

interface CommunityRecord {
  name?: string
  description?: string
}

export interface CommunityOwnership {
  communityDid: string
  communityUri: string
  ownerDid: string
  name?: string
}

export type CommunityOwnershipFailure =
  | 'unresolvable-did'
  | 'unreachable'
  | 'not-a-community'
  | 'no-owner'

export type CommunityOwnershipResult =
  | { ok: true; ownership: CommunityOwnership }
  | { ok: false; reason: CommunityOwnershipFailure; detail?: string }

export function communityUriFor(did: string): string {
  return `at://${did}/${COMMUNITY_COLLECTION}/self`
}

function rkeyOf(uri: string): string {
  return uri.slice(uri.lastIndexOf('/') + 1)
}

async function resolveCommunityPds(did: string): Promise<string | null> {
  try {
    return await resolvePds(did)
  } catch (e) {
    console.warn('[chat] public DID resolution failed, trying the configured PDS', {
      did,
      error: e instanceof Error ? e.message : String(e)
    })
    const configuredPds = useRuntimeConfig().chat.pdsLoc as string
    if (!configuredPds) return null
    try {
      await $fetch(`${configuredPds}/xrpc/com.atproto.repo.describeRepo`, { query: { repo: did } })
      return configuredPds
    } catch {
      return null
    }
  }
}

async function listRecords<T>(
  pds: string,
  repo: string,
  collection: string,
  opts: { limit?: number; cursor?: string; reverse?: boolean } = {}
): Promise<{ records: Array<{ uri: string; value: T }>; cursor?: string }> {
  const data = await $fetch<{ records?: Array<{ uri: string; value: T }>; cursor?: string }>(
    `${pds}/xrpc/com.atproto.repo.listRecords`,
    {
      query: {
        repo,
        collection,
        limit: opts.limit ?? MEMBER_PAGE_SIZE,
        cursor: opts.cursor,
        reverse: opts.reverse
      }
    }
  )
  return { records: data.records ?? [], cursor: data.cursor }
}

export async function resolveCommunityOwnership(did: string): Promise<CommunityOwnershipResult> {
  const pds = await resolveCommunityPds(did)
  if (!pds) return { ok: false, reason: 'unresolvable-did' }

  try {
    const community = await listRecords<CommunityRecord>(pds, did, COMMUNITY_COLLECTION, {
      limit: 5
    })
    const self = community.records.find((r) => rkeyOf(r.uri) === 'self')
    if (!self) return { ok: false, reason: 'not-a-community' }

    const roles = await listRecords<RoleRecord>(pds, did, ROLE_COLLECTION, { limit: 100 })
    const ownerRole = roles.records.find((r) => r.value.protected === true)
    if (!ownerRole) return { ok: false, reason: 'no-owner', detail: 'no protected role' }
    const ownerRoleKey = rkeyOf(ownerRole.uri)

    let cursor: string | undefined
    for (let page = 0; page < MAX_MEMBER_PAGES; page++) {
      const members = await listRecords<MemberRecord>(pds, did, MEMBER_COLLECTION, {
        cursor,
        reverse: true
      })
      const owner = members.records.find((m) => m.value.roles?.includes(ownerRoleKey))
      if (owner?.value.subject) {
        return {
          ok: true,
          ownership: {
            communityDid: did,
            communityUri: communityUriFor(did),
            ownerDid: owner.value.subject,
            name: self.value.name
          }
        }
      }
      if (!members.cursor || members.records.length === 0) break
      cursor = members.cursor
    }

    return { ok: false, reason: 'no-owner', detail: 'no member holds the protected role' }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.warn('[chat] could not read community records', { did, pds, error: message })
    return { ok: false, reason: 'unreachable', detail: message }
  }
}

export function describeCommunityFailure(reason: CommunityOwnershipFailure, did: string): string {
  switch (reason) {
    case 'unresolvable-did':
      return `Could not resolve ${did} to a PDS. Check the DID is correct and that its identity is published.`
    case 'unreachable':
      return `Could not read ${did}'s repo from its PDS. It may be temporarily unavailable.`
    case 'not-a-community':
      return `${did} has no social.colibri.community record, so it isn't a Colibri community.`
    case 'no-owner':
      return `${did} is a community but has no Owner yet, so there is nobody to verify against.`
  }
}
