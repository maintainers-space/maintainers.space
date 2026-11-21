// Kick off the offline-repo prefetcher once the app is up and stays online.
// The prefetcher is existence-first (~/lib/cache `prefetch`), so this neither
// hammers the forges on startup nor re-fetches repos already available offline;
// it just seeds the repos this user returns to most. Re-runs whenever the device
// regains connectivity after being offline.
import { useOfflineRepos } from '~/composables/useOfflineRepos'

export default defineNuxtPlugin(() => {
  if (!import.meta.client) return

  const maybeRun = (): void => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    setTimeout(() => void useOfflineRepos().auto(), 3000)
  }

  // Start shortly after the app boots, then again each reconnect.
  maybeRun()
  if (typeof window !== 'undefined') window.addEventListener('online', maybeRun)
})
