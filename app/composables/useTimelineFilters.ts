import type { ForgeEventKind } from '~/types/forge'

// Persisted event-kind filter for the Timeline page. `star`/`other` never
// reach the timeline (filtered upstream in useTimeline.ts), so they aren't
// offered here.
export type FilterableKind = Exclude<ForgeEventKind, 'star' | 'other'>

export const FILTERABLE_KINDS: FilterableKind[] = [
  'pr_merged',
  'pr_opened',
  'pr_review',
  'issue_opened',
  'issue_closed',
  'comment',
  'push',
  'create',
  'release',
  'fork'
]

export const KIND_FILTER_LABEL: Record<FilterableKind, string> = {
  pr_merged: 'Merged PRs',
  pr_opened: 'Opened PRs',
  pr_review: 'Reviews',
  issue_opened: 'Opened issues',
  issue_closed: 'Closed issues',
  comment: 'Comments',
  push: 'Pushes',
  create: 'Branches & tags',
  release: 'Releases',
  fork: 'Forks'
}

const STORAGE_KEY = 'maintainers.space:timeline-event-filters'

const enabled = ref<Set<FilterableKind>>(new Set(FILTERABLE_KINDS))

/** Shared, localStorage-persisted set of enabled event kinds (default: all). */
export function useTimelineFilters() {
  function load(): void {
    if (!import.meta.client) return
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const saved = JSON.parse(raw) as unknown
      if (!Array.isArray(saved)) return
      const valid = saved.filter(
        (k): k is FilterableKind =>
          typeof k === 'string' && FILTERABLE_KINDS.includes(k as FilterableKind)
      )
      if (valid.length) enabled.value = new Set(valid)
    } catch {
      /* keep default (everything enabled) */
    }
  }

  function toggle(kind: FilterableKind): void {
    const next = new Set(enabled.value)
    if (next.has(kind)) next.delete(kind)
    else next.add(kind)
    enabled.value = next
    if (import.meta.client) localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
  }

  function isEnabled(kind: ForgeEventKind): boolean {
    return enabled.value.has(kind as FilterableKind)
  }

  return { kinds: FILTERABLE_KINDS, enabled, toggle, isEnabled, load }
}
