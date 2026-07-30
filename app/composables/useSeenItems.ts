// Tracks which ids in a given bucket the viewer has already seen, so feeds
// like the home dashboard can show a small "new since last visit" dot instead
// of leaving it ambiguous whether an item is stale or fresh. Local-only.
const PREFIX = 'maintainers.space:seen:'
const MAX_TRACKED = 500

export function useSeenItems(bucket: string) {
  const storageKey = PREFIX + bucket
  const seen = ref<Set<string>>(new Set())

  if (import.meta.client) {
    try {
      seen.value = new Set(JSON.parse(localStorage.getItem(storageKey) || '[]'))
    } catch {
      seen.value = new Set()
    }
  }

  function isNew(id: string): boolean {
    return import.meta.client && !seen.value.has(id)
  }

  /** Mark the given ids as seen — call once the viewer has had a chance to look at them. */
  function markSeen(ids: string[]): void {
    if (!import.meta.client || !ids.length) return
    const merged = new Set(seen.value)
    for (const id of ids) merged.add(id)
    const capped = [...merged].slice(-MAX_TRACKED)
    seen.value = new Set(capped)
    localStorage.setItem(storageKey, JSON.stringify(capped))
  }

  return { isNew, markSeen }
}
