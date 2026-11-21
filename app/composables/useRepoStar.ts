import { ok } from '@atcute/client'
import type {} from '@atcute/atproto'
import type { Did, Nsid } from '@atcute/lexicons'
import type { Ref } from 'vue'
import type { Repo } from 'forges'
import { canStar, isStarred, setStarred } from '~/lib/forges/gaps/social'
import { getRepoStats } from '~/lib/forges/gaps/repo-stats'

const TANGLED_STAR_COLLECTION = 'sh.tangled.feed.star'

interface TangledStarRecord {
  uri: string
  value: { subject?: { did?: string } }
}

/**
 * Reactive star state for a single repository, unified across providers.
 * Token forges (GitHub/GitLab/…) go through the star gap in ~/lib/forges/gaps/social;
 * Tangled writes a `sh.tangled.feed.star` record via the atproto session.
 */
export function useRepoStar(repo: Ref<Repo | null>) {
  const { isConnected, providerFor } = useForges()
  const { did, runAuthed } = useAuth()

  const starred = ref(false)
  const stars = ref<number | undefined>(undefined)
  const pending = ref(false)
  const loaded = ref(false)
  const tangledRkey = ref<string | null>(null)

  const forge = computed(() => (repo.value ? providerFor(repo.value.ref) : undefined))

  const isTangled = computed(() => repo.value?.ref.forge === 'tangled')

  const starable = computed(() => {
    const r = repo.value
    const f = forge.value
    if (!r || !f) return false
    if (isTangled.value) return !!did.value && !!r.ref.externalId
    return canStar(f) && isConnected(r.ref)
  })

  function repoDid(): string | undefined {
    return repo.value?.ref.externalId
  }

  async function loadTangled(): Promise<void> {
    const subject = repoDid()
    if (!subject || !did.value) return
    const data = await runAuthed((rpc) =>
      ok(
        rpc.get('com.atproto.repo.listRecords', {
          params: {
            repo: did.value as Did,
            collection: TANGLED_STAR_COLLECTION as Nsid,
            limit: 100
          }
        })
      )
    )
    const records = (data.records ?? []) as unknown as TangledStarRecord[]
    const mine = records.find((r) => r.value?.subject?.did === subject)
    starred.value = !!mine
    tangledRkey.value = mine ? (mine.uri.split('/').pop() ?? null) : null
  }

  async function load(): Promise<void> {
    const r = repo.value
    stars.value = r ? getRepoStats(r).stars : undefined
    starred.value = false
    tangledRkey.value = null
    if (!r || !starable.value) {
      loaded.value = true
      return
    }
    try {
      if (isTangled.value) {
        await loadTangled()
      } else if (forge.value) {
        starred.value = await isStarred(forge.value, r.ref.owner, r.ref.name)
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
      const res = await runAuthed((rpc) =>
        ok(
          rpc.post('com.atproto.repo.createRecord', {
            input: {
              repo: did.value as Did,
              collection: TANGLED_STAR_COLLECTION as Nsid,
              record: record as unknown as Record<string, unknown>
            }
          })
        )
      )
      tangledRkey.value = res.uri.split('/').pop() ?? null
    } else {
      const rkey = tangledRkey.value
      if (!rkey) return
      await runAuthed((rpc) =>
        rpc.post('com.atproto.repo.deleteRecord', {
          input: { repo: did.value as Did, collection: TANGLED_STAR_COLLECTION as Nsid, rkey },
          as: null
        })
      )
      tangledRkey.value = null
    }
  }

  async function toggle(): Promise<void> {
    const r = repo.value
    if (!r || !starable.value || pending.value) return
    const next = !starred.value
    starred.value = next
    if (typeof stars.value === 'number') {
      stars.value += next ? 1 : -1
    }
    pending.value = true
    try {
      if (isTangled.value) {
        await toggleTangled(next)
      } else if (forge.value) {
        const total = await setStarred(forge.value, r.ref.owner, r.ref.name, next)
        if (typeof total === 'number') stars.value = total
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
    [() => repo.value?.ref.forge, () => repo.value?.ref.owner, () => repo.value?.ref.name, did],
    () => {
      loaded.value = false
      load()
    },
    { immediate: true }
  )

  return { starred, stars, pending, loaded, canStar: starable, toggle }
}
