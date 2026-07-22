import { ok } from '@atcute/client'
import type {} from '@atcute/atproto'
import type { Did, Nsid } from '@atcute/lexicons'
import type { MaybeRefOrGetter } from 'vue'
import { getPublicRecord } from '~/lib/atproto/public'
import {
  REPO_METADATA_COLLECTION,
  repoMetadataRkey,
  repoSubject,
  sanitizeLinks,
  type CommunityLink,
  type RepoMetadataRecord
} from '~/lib/repo-metadata'
import type { RepoMetadataTarget } from './useRepoMetadata'

const COLLECTION = REPO_METADATA_COLLECTION as Nsid
const STASH_PREFIX = 'koinon:repo-claim:'
const CLAIM_PROVIDERS = new Set(['github', 'gitlab', 'codeberg'])

function stashKey(subject: string): string {
  return STASH_PREFIX + subject
}

function stashLinks(subject: string, links: CommunityLink[]): void {
  if (!import.meta.client) return
  try {
    sessionStorage.setItem(stashKey(subject), JSON.stringify(links))
  } catch { /* ignore quota / private-mode failures */ }
}

function takeStashedLinks(subject: string): CommunityLink[] {
  if (!import.meta.client) return []
  try {
    const raw = sessionStorage.getItem(stashKey(subject))
    sessionStorage.removeItem(stashKey(subject))
    return raw ? sanitizeLinks(JSON.parse(raw)) : []
  } catch {
    return []
  }
}

function claimErrorMessage(code: string): string {
  switch (code) {
    case 'not-admin': return 'You need admin access to that repository to claim it.'
    case 'unconfigured': return 'Repository claims are not available on this server.'
    default: return 'Could not verify repository ownership. Please try again.'
  }
}

/**
 * Owner-side editor for repo community metadata. Personal repos and org repos
 * are claimed with an OAuth round-trip that proves admin (github/gitlab/codeberg);
 * Tangled repos are edited directly by their atproto owner. Records are written
 * to the signed-in user's PDS.
 */
export function useRepoMetadataEditor(source?: MaybeRefOrGetter<RepoMetadataTarget | null>) {
  const { did, runAuthed, restoring } = useAuth()
  const toast = useToast()

  const own = ref<RepoMetadataRecord | null>(null)
  const ownLoaded = ref(false)
  const saving = ref(false)

  function target(): RepoMetadataTarget | null {
    return source ? toValue(source) ?? null : null
  }

  const canManage = computed(() => {
    const t = target()
    if (!t || !did.value) return false
    if (t.provider === 'tangled') return !!t.repoDid && t.repoDid === did.value
    return CLAIM_PROVIDERS.has(t.provider)
  })

  const isClaimed = computed(() => !!own.value)

  async function loadOwn(): Promise<void> {
    const t = target()
    if (!t || !did.value) {
      own.value = null
      ownLoaded.value = true
      return
    }
    const rkey = repoMetadataRkey(t.provider, t.owner, t.name, t.host)
    const rec = await getPublicRecord<RepoMetadataRecord>(did.value, REPO_METADATA_COLLECTION, rkey)
    own.value = rec?.value ?? null
    ownLoaded.value = true
  }

  async function writeRecord(
    t: RepoMetadataTarget,
    links: CommunityLink[],
    attestation?: string,
    attestedBy?: string
  ): Promise<void> {
    if (!did.value) throw new Error('Not authenticated')
    const record: RepoMetadataRecord = {
      $type: REPO_METADATA_COLLECTION,
      provider: t.provider,
      owner: t.owner,
      name: t.name,
      subject: repoSubject(t.provider, t.owner, t.name),
      links: links.length ? links : undefined,
      attestation,
      attestedBy,
      createdAt: own.value?.createdAt ?? new Date().toISOString()
    }
    if (t.host) record.host = t.host
    for (const k of Object.keys(record) as Array<keyof RepoMetadataRecord>) {
      if (record[k] === undefined) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete record[k]
      }
    }
    await runAuthed(rpc => ok(rpc.post('com.atproto.repo.putRecord', {
      input: {
        repo: did.value as Did,
        collection: COLLECTION,
        rkey: repoMetadataRkey(t.provider, t.owner, t.name, t.host),
        record: record as unknown as Record<string, unknown>
      }
    })))
    own.value = record
  }

  function startClaim(t: RepoMetadataTarget): void {
    if (!import.meta.client || !CLAIM_PROVIDERS.has(t.provider)) return
    const params = new URLSearchParams({
      redirect: location.pathname + location.search,
      claimOwner: t.owner,
      claimName: t.name
    })
    if (did.value) params.set('did', did.value)
    window.location.assign(`/api/auth/${t.provider}/login?${params.toString()}`)
  }

  /**
   * Persist community links. Returns `{ claiming: true }` when a first-time claim
   * redirect was started (links are stashed and written on return).
   */
  async function save(rawLinks: CommunityLink[]): Promise<{ claiming: boolean }> {
    const t = target()
    if (!t || !did.value) throw new Error('Not authenticated')
    const links = sanitizeLinks(rawLinks)

    if (t.provider === 'tangled') {
      if (t.repoDid !== did.value) throw new Error('Only the repository owner can edit this.')
      await writeRecord(t, links)
      return { claiming: false }
    }

    if (own.value?.attestation && own.value.attestedBy) {
      await writeRecord(t, links, own.value.attestation, own.value.attestedBy)
      return { claiming: false }
    }

    stashLinks(repoSubject(t.provider, t.owner, t.name), links)
    startClaim(t)
    return { claiming: true }
  }

  async function remove(): Promise<void> {
    const t = target()
    if (!t || !did.value) return
    await runAuthed(rpc => rpc.post('com.atproto.repo.deleteRecord', {
      input: {
        repo: did.value as Did,
        collection: COLLECTION,
        rkey: repoMetadataRkey(t.provider, t.owner, t.name, t.host)
      },
      as: null
    }))
    own.value = null
  }

  /**
   * Finish a claim after the OAuth round-trip: read the signed attestation from
   * the callback fragment and write the stashed links. Surfaces the outcome as a
   * toast; safe to call for non-claim callbacks (returns immediately).
   */
  async function finishClaim(provider: string, params: URLSearchParams): Promise<void> {
    const claimOwner = params.get('claimOwner')
    const claimName = params.get('claimName')
    if (!claimOwner || !claimName) return

    const subject = repoSubject(provider, claimOwner, claimName)
    const claimError = params.get('claimError')
    const attestation = params.get('repoAttestation') || undefined
    const attestedBy = params.get('repoAttestedBy') || undefined

    if (claimError || !attestation || !attestedBy) {
      takeStashedLinks(subject)
      toast.add({
        title: 'Repository claim failed',
        description: claimErrorMessage(claimError ?? 'failed'),
        color: 'error',
        icon: 'i-lucide-circle-alert'
      })
      return
    }

    while (restoring.value) await new Promise(r => setTimeout(r, 50))
    if (!did.value) return

    const links = takeStashedLinks(subject)
    try {
      await writeRecord({ provider, owner: claimOwner, name: claimName }, links, attestation, attestedBy)
      toast.add({
        title: 'Repository claimed',
        description: 'Your community links are now published.',
        color: 'success',
        icon: 'i-lucide-check'
      })
    } catch {
      toast.add({
        title: 'Could not save community links',
        description: 'Ownership was verified but the record could not be written.',
        color: 'error',
        icon: 'i-lucide-circle-alert'
      })
    }
  }

  if (source) {
    watch(
      () => {
        const t = target()
        return t ? `${t.provider}/${t.owner}/${t.name}|${did.value ?? ''}` : ''
      },
      () => { void loadOwn() },
      { immediate: true }
    )
  }

  return {
    own,
    ownLoaded,
    saving,
    canManage,
    isClaimed,
    loadOwn,
    save,
    remove,
    finishClaim
  }
}
