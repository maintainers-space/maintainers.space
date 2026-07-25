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
  /** Tangled repo-entity DID (from repo.ref.repoDid); used for stars/issues subjects. */
  repoDid?: string
  /** Tangled owner DID — the authority of the repo record's at-URI; the ownership principal. */
  ownerDid?: string
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
 * the record owner being the repo's atproto owner DID. Every field read from the
 * untrusted record is type-checked first so one malformed record can't throw.
 */
async function verifyEntry(
  target: RepoMetadataTarget,
  did: string,
  record: RepoMetadataRecord
): Promise<boolean> {
  if (
    typeof record.subject !== 'string' ||
    typeof record.provider !== 'string' ||
    typeof record.owner !== 'string' ||
    typeof record.name !== 'string'
  )
    return false
  if (record.subject !== repoSubject(target.provider, target.owner, target.name)) return false
  if (record.provider !== target.provider) return false
  if (record.owner.toLowerCase() !== target.owner.toLowerCase()) return false
  if (record.name.toLowerCase() !== target.name.toLowerCase()) return false
  if (target.provider === 'tangled') return !!target.ownerDid && did === target.ownerDid
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
  let generation = 0
  let currentSubject = ''

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
    const gen = ++generation
    const target = toValue(source)
    if (!target?.provider || !target.owner || !target.name) {
      entries.value = []
      currentSubject = ''
      pending.value = false
      loaded.value = true
      return
    }
    const subject = repoSubject(target.provider, target.owner, target.name)
    // Navigated to a different repo: drop the previous repo's links immediately
    // so they can never be shown against the wrong repository.
    if (subject !== currentSubject) entries.value = []
    pending.value = true
    try {
      const backlinks = await getBacklinks(subject, BACKLINK_SOURCE, { force }).catch(() => [])
      // Each candidate is fetched and verified in isolation, so a single
      // hostile/malformed record can never reject the whole batch.
      const settled = await Promise.allSettled(
        backlinks.map(async (bl): Promise<RepoMetadataEntry | null> => {
          if (bl.collection !== REPO_METADATA_COLLECTION) return null
          const rec = await getPublicRecord<RepoMetadataRecord>(
            bl.did,
            REPO_METADATA_COLLECTION,
            bl.rkey
          )
          if (rec && (await verifyEntry(target, bl.did, rec.value))) {
            return { did: bl.did, rkey: bl.rkey, record: rec.value }
          }
          return null
        })
      )
      // A newer load superseded this one while it was in flight: discard.
      if (gen !== generation) return
      const verified = settled
        .flatMap((r) => (r.status === 'fulfilled' && r.value ? [r.value] : []))
        .sort((a, b) => (a.record.createdAt < b.record.createdAt ? 1 : -1))
      currentSubject = subject
      entries.value = verified
    } finally {
      if (gen === generation) {
        pending.value = false
        loaded.value = true
      }
    }
  }

  watch(
    () => {
      const t = toValue(source)
      return t ? `${t.provider}/${t.owner}/${t.name}|${t.ownerDid ?? ''}` : ''
    },
    () => {
      void load()
    },
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
