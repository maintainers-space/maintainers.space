import { ok } from '@atcute/client'
import type {} from '@atcute/atproto'
import type { Did, Nsid } from '@atcute/lexicons'
import type { Ref } from 'vue'
import { getForge } from '~/lib/forges'
import type { ForgeId, ForgeRepo, RepoLocator } from '~/types/forge'

const TANGLED_STAR_COLLECTION = 'sh.tangled.feed.star'

interface TangledStarRecord {
  uri: string
  value: { subject?: { did?: string } }
}

/**
 * Reactive star state for a single repository, unified across providers.
 * Token forges (GitHub/GitLab/…) go through the provider `isStarred`/`setStar`
 * methods; Tangled writes a `sh.tangled.feed.star` record via the atproto session.
 */
export function useRepoStar(repo: Ref<ForgeRepo | null>) {
  const { get: getToken } = useForgeTokens()
  const { did, runAuthed } = useAuth()

  const starred = ref(false)
  const stars = ref<number | undefined>(undefined)
  const pending = ref(false)
  const loaded = ref(false)
  const tangledRkey = ref<string | null>(null)

  const forge = computed(() => (repo.value ? getForge(repo.value.provider) : undefined))
  const locator = computed<RepoLocator | null>(() =>
    repo.value ? { owner: repo.value.owner, name: repo.value.name, ref: repo.value.ref } : null)

  const isTangled = computed(() => repo.value?.provider === 'tangled')

  const canStar = computed(() => {
    const r = repo.value
    const f = forge.value
    if (!r || !f?.capabilities.star) return false
    if (isTangled.value) return !!did.value && !!r.ref?.repoDid
    return !!getToken(r.provider as ForgeId) && !!f.setStar
  })

  function repoDid(): string | undefined {
    return repo.value?.ref?.repoDid as string | undefined
  }

  async function loadTangled(): Promise<void> {
    const subject = repoDid()
    if (!subject || !did.value) return
    const data = await runAuthed(rpc => ok(rpc.get('com.atproto.repo.listRecords', {
      params: { repo: did.value as Did, collection: TANGLED_STAR_COLLECTION as Nsid, limit: 100 }
    })))
    const records = (data.records ?? []) as unknown as TangledStarRecord[]
    const mine = records.find(r => r.value?.subject?.did === subject)
    starred.value = !!mine
    tangledRkey.value = mine ? (mine.uri.split('/').pop() ?? null) : null
  }

  async function load(): Promise<void> {
    const r = repo.value
    stars.value = r?.stars
    starred.value = false
    tangledRkey.value = null
    if (!r || !canStar.value) {
      loaded.value = true
      return
    }
    try {
      if (isTangled.value) {
        await loadTangled()
      } else if (locator.value && forge.value?.isStarred) {
        starred.value = await forge.value.isStarred(locator.value, { token: getToken(r.provider as ForgeId) })
      }
    } catch {
      // Best-effort: an unreadable star state just shows as not-starred.
    } finally {
      loaded.value = true
    }
  }

  async function toggleTangled(next: boolean): Promise<void> {
    const subject = repoDid()
    if (!subject || !did.value) throw new Error('Cannot star this repository.')
    if (next) {
      const record = {
        $type: TANGLED_STAR_COLLECTION,
        subject: { $type: `${TANGLED_STAR_COLLECTION}#repo`, did: subject },
        createdAt: new Date().toISOString()
      }
      const res = await runAuthed(rpc => ok(rpc.post('com.atproto.repo.createRecord', {
        input: {
          repo: did.value as Did,
          collection: TANGLED_STAR_COLLECTION as Nsid,
          record: record as unknown as Record<string, unknown>
        }
      })))
      tangledRkey.value = res.uri.split('/').pop() ?? null
    } else {
      const rkey = tangledRkey.value
      if (!rkey) return
      await runAuthed(rpc => rpc.post('com.atproto.repo.deleteRecord', {
        input: { repo: did.value as Did, collection: TANGLED_STAR_COLLECTION as Nsid, rkey },
        as: null
      }))
      tangledRkey.value = null
    }
  }

  async function toggle(): Promise<void> {
    const r = repo.value
    if (!r || !canStar.value || pending.value) return
    const next = !starred.value
    starred.value = next
    if (typeof stars.value === 'number') {
      stars.value += next ? 1 : -1
    }
    pending.value = true
    try {
      if (isTangled.value) {
        await toggleTangled(next)
      } else if (locator.value && forge.value?.setStar) {
        const res = await forge.value.setStar(locator.value, next, { token: getToken(r.provider as ForgeId) })
        starred.value = res.starred
        if (typeof res.stars === 'number') {
          stars.value = res.stars
        }
      }
    } catch (e) {
      starred.value = !next
      if (typeof stars.value === 'number') {
        stars.value += next ? -1 : 1
      }
      throw e
    } finally {
      pending.value = false
    }
  }

  watch(
    [() => repo.value?.provider, () => repo.value?.owner, () => repo.value?.name, did],
    () => {
      loaded.value = false
      load()
    },
    { immediate: true }
  )

  return { starred, stars, pending, loaded, canStar, toggle }
}
