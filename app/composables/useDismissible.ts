const PREFIX = 'koinon:dismissed:'

/** A banner the viewer can close, which then stays hidden for `days` before reappearing. */
export function useDismissible(key: string, days = 14) {
  const windowMs = days * 24 * 60 * 60 * 1000
  const storageKey = PREFIX + key
  const dismissedAt = ref<number | null>(
    import.meta.client ? Number(localStorage.getItem(storageKey)) || null : null
  )

  const dismissed = computed(() => !!dismissedAt.value && Date.now() - dismissedAt.value < windowMs)

  function dismiss(): void {
    const now = Date.now()
    dismissedAt.value = now
    if (import.meta.client) localStorage.setItem(storageKey, String(now))
  }

  return { dismissed, dismiss }
}
