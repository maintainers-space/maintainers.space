import type { MaybeRefOrGetter } from 'vue'
import { verifyRepoAttestation } from '~/lib/atproto/attestation'
import { getBacklinks } from '~/lib/atproto/constellation'
import { getPublicRecord } from '~/lib/atproto/public'
import {
  REPO_METADATA_COLLECTION,
  repoSubject,
  sanitizeLinks,
  type CommunityLink,
  type RepoMetadataRecord
} from '~/lib/repo-metadata'

const BACKLINK_SOURCE = `${REPO_METADATA_COLLECTION}:subject`

export interface RepoMetadataTarget {
  provider: string
  owner: string
  name: string
  host?: string
  /** Tangled owner DID (from repo.ref.repoDid); enables atproto-native ownership. */
  repoDid?: string
}

export interface RepoMetadataEntry {
  did: string
  rkey: string
  record: RepoMetadataRecord
}

/**
 * Confirm a fetched record genuinely belongs to the repo being viewed and is
 * cryptographically owned by `did`: matching subject/provider/owner/name plus
 * either a valid server attestation (github/gitlab/codeberg) or, for Tangled,
 * the record owner being the repo's atproto DID.
 */
async function verifyEntry(target: RepoMetadataTarget, did: string, record: RepoMetadataRecord): Promise<boolean> {
  if (record.subject !== repoSubject(target.provider, target.owner, target.name)) return false
  if (record.provider !== target.provider) return false
  if (record.owner.toLowerCase() !== target.owner.toLowerCase()) return false
  if (record.name.toLowerCase() !== target.name.toLowerCase()) return false
  if (target.provider === 'tangled') return !!target.repoDid && did === target.repoDid
  return verifyRepoAttestation(record, did)
}

/**
 * Reverse-resolve and verify community metadata attached to a repo. Discovery is
 * via constellation backlinks, but every candidate record is re-fetched from its
 * owner's PDS and independently verified, so a stale/hostile index cannot inject
 * links. Merged links are deduped across all valid owners.
 */
export function useRepoMetadata(source: MaybeRefOrGetter<RepoMetadataTarget | null>) {
  const entries = ref<RepoMetadataEntry[]>([])
  const pending = ref(false)
  const loaded = ref(false)

  const links = computed<CommunityLink[]>(() => {
    const seen = new Set<string>()
    const out: CommunityLink[] = []
    for (const entry of entries.value) {
      for (const link of sanitizeLinks(entry.record.links)) {
        const key = link.url.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        out.push(link)
      }
    }
    return out
  })

  async function load(force = false): Promise<void> {
    const target = toValue(source)
    if (!target?.provider || !target.owner || !target.name) {
      entries.value = []
      loaded.value = true
      return
    }
    pending.value = true
    try {
      const subject = repoSubject(target.provider, target.owner, target.name)
      const backlinks = await getBacklinks(subject, BACKLINK_SOURCE, { force })
      const verified: RepoMetadataEntry[] = []
      await Promise.all(backlinks.map(async (bl) => {
        if (bl.collection !== REPO_METADATA_COLLECTION) return
        const rec = await getPublicRecord<RepoMetadataRecord>(bl.did, REPO_METADATA_COLLECTION, bl.rkey)
        if (rec && await verifyEntry(target, bl.did, rec.value)) {
          verified.push({ did: bl.did, rkey: bl.rkey, record: rec.value })
        }
      }))
      verified.sort((a, b) => (a.record.createdAt < b.record.createdAt ? 1 : -1))
      entries.value = verified
    } finally {
      pending.value = false
      loaded.value = true
    }
  }

  watch(
    () => {
      const t = toValue(source)
      return t ? `${t.provider}/${t.owner}/${t.name}|${t.repoDid ?? ''}` : ''
    },
    () => { void load() },
    { immediate: true }
  )

  return {
    entries,
    links,
    pending,
    loaded,
    refresh: (force = true) => load(force)
  }
}
