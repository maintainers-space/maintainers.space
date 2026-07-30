// Local, privacy-friendly repo visit tracking.
//
// Every repository you open is counted in localStorage (never sent anywhere) so
// signed-in users get a personal "recent / favourite repos" feed instead of a
// generic trending list. Favourites are ranked by recency-decayed frequency;
// "jump back in" additionally weighs how many distinct sections (issues, pulls,
// actions, ...) you've actually engaged with, not just how many times you
// glanced at the overview. Kept indefinitely — `clear()` is the only way out,
// wired to a "Clear history" control on the home page.
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
  /** Visit count per route section (code/issues/pulls/actions/discussions/...). */
  sections?: Record<string, number>
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

/**
 * "Likeliness to return" for the home page's Jump back in list: still
 * recency-led, but a repo you've dug into (issues, PRs, actions, ...) beyond
 * the overview signals more engagement — and therefore more reason to
 * resurface it — than one you only glanced at once.
 */
function engagementScore(v: RepoVisit): number {
  const ageDays = (Date.now() - v.lastVisit) / 86_400_000
  const recency = Math.pow(0.5, ageDays / HALF_LIFE_DAYS)
  const breadth = Object.keys(v.sections ?? {}).length
  return recency * (v.count + breadth * 2)
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
      lastVisit: Date.now(),
      sections: prev?.sections
    }
    _visits.value = prune({ ..._visits.value, [k]: entry })
    persist()
  }

  /** Record that a specific section (issues/pulls/actions/...) of an already-visited repo was opened. */
  function recordSection(r: Pick<ForgeRepo, 'provider' | 'owner' | 'name'>, section: string): void {
    if (!import.meta.client || !r?.owner || !r?.name) return
    const k = keyOf(r)
    const prev = _visits.value[k]
    if (!prev) return
    const sections = prev.sections ? { ...prev.sections } : {}
    sections[section] = (sections[section] ?? 0) + 1
    _visits.value = { ..._visits.value, [k]: { ...prev, sections, lastVisit: Date.now() } }
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

  /** Ranked by likeliness of return (recency + engagement breadth) — powers "Jump back in". */
  const jumpBackIn = computed<RepoVisit[]>(() =>
    Object.values(_visits.value).sort((a, b) => engagementScore(b) - engagementScore(a))
  )

  const hasVisits = computed(() => Object.keys(_visits.value).length > 0)

  return {
    visits: readonly(_visits),
    record,
    recordSection,
    clear,
    recent,
    favourites,
    jumpBackIn,
    hasVisits
  }
}
