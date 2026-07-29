// Local, privacy-friendly repo visit tracking.
//
// Every repository you open is counted in localStorage (never sent anywhere) so
// signed-in users get a personal "recent / favourite repos" feed instead of a
// generic trending list. Favourites are ranked by recency-decayed frequency:
// repositories you visit often *and* recently bubble to the top.
import type { ForgeRepo } from '~/types/forge'

const STORAGE_KEY = 'maintainers.space:repo-visits'
const MAX_ENTRIES = 80
/** Half-life (days) for the recency decay used when ranking favourites. */
const HALF_LIFE_DAYS = 21

export interface RepoVisit {
  provider: string
  owner: string
  name: string
  fullName: string
  description?: string | null
  language?: string | null
  stars?: number
  count: number
  lastVisit: number
}

const _visits = ref<Record<string, RepoVisit>>({})
let _loaded = false

function keyOf(r: { provider: string; owner: string; name: string }): string {
  return `${r.provider}/${r.owner}/${r.name}`
}

function load(): void {
  if (_loaded || !import.meta.client) return
  try {
    _visits.value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    _visits.value = {}
  }
  _loaded = true
}

function persist(): void {
  if (import.meta.client) localStorage.setItem(STORAGE_KEY, JSON.stringify(_visits.value))
}

/** Recency-decayed frequency: count weighted so recent visits rank higher. */
function score(v: RepoVisit): number {
  const ageDays = (Date.now() - v.lastVisit) / 86_400_000
  return v.count * Math.pow(0.5, ageDays / HALF_LIFE_DAYS)
}

function prune(map: Record<string, RepoVisit>): Record<string, RepoVisit> {
  const entries = Object.entries(map)
  if (entries.length <= MAX_ENTRIES) return map
  const kept = entries.sort(([, a], [, b]) => score(b) - score(a)).slice(0, MAX_ENTRIES)
  return Object.fromEntries(kept)
}

export function useRepoVisits() {
  load()

  /** Record a visit to a repository (called from the repo shell page). */
  function record(
    r: Pick<
      ForgeRepo,
      'provider' | 'owner' | 'name' | 'fullName' | 'description' | 'language' | 'stars'
    >
  ): void {
    if (!import.meta.client || !r?.owner || !r?.name) return
    const k = keyOf(r)
    const prev = _visits.value[k]
    const entry: RepoVisit = {
      provider: r.provider,
      owner: r.owner,
      name: r.name,
      fullName: r.fullName ?? `${r.owner}/${r.name}`,
      description: r.description ?? prev?.description ?? null,
      language: r.language ?? prev?.language ?? null,
      stars: r.stars ?? prev?.stars,
      count: (prev?.count ?? 0) + 1,
      lastVisit: Date.now()
    }
    _visits.value = prune({ ..._visits.value, [k]: entry })
    persist()
  }

  function clear(): void {
    _visits.value = {}
    persist()
  }

  const recent = computed<RepoVisit[]>(() =>
    Object.values(_visits.value).sort((a, b) => b.lastVisit - a.lastVisit)
  )

  const favourites = computed<RepoVisit[]>(() =>
    Object.values(_visits.value).sort((a, b) => score(b) - score(a))
  )

  const hasVisits = computed(() => Object.keys(_visits.value).length > 0)

  return { visits: readonly(_visits), record, clear, recent, favourites, hasVisits }
}
