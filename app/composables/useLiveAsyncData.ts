import type { AsyncData, AsyncDataOptions } from '#app'
import { TTL } from '~/lib/cache'

interface LiveOptions {
  /**
   * Minimum time (ms) between focus-triggered refetches. Returning to the tab
   * sooner than this reuses the current data; later triggers a background
   * refresh. Defaults to {@link TTL.SHORT} (~1 minute).
   */
  staleAfter?: number
}

/**
 * A {@link useAsyncData} that transparently refetches when the tab regains
 * focus after being hidden for a while. Detail views (a PR, an issue, a
 * pipeline run) are frequently left open while the user acts on the upstream
 * forge; without this they would show whatever was fetched when first opened.
 * The refetch is throttled so quickly toggling tabs never spams the provider.
 */
export function useLiveAsyncData<T>(
  key: string | (() => string),
  handler: () => Promise<T>,
  options: AsyncDataOptions<T> & LiveOptions = {}
): AsyncData<T | undefined, unknown> {
  const { staleAfter = TTL.SHORT, ...asyncOptions } = options
  const result = useAsyncData<T>(key, handler, asyncOptions)

  if (import.meta.client) {
    let lastFetch = Date.now()
    watch(result.status, (s) => {
      if (s === 'success' || s === 'error') lastFetch = Date.now()
    })

    const onFocus = (): void => {
      if (document.visibilityState !== 'visible') return
      if (result.status.value === 'pending') return
      if (Date.now() - lastFetch < staleAfter) return
      lastFetch = Date.now()
      void result.refresh()
    }

    onMounted(() => {
      document.addEventListener('visibilitychange', onFocus)
      window.addEventListener('focus', onFocus)
    })
    onBeforeUnmount(() => {
      document.removeEventListener('visibilitychange', onFocus)
      window.removeEventListener('focus', onFocus)
    })
  }

  return result as AsyncData<T | undefined, unknown>
}
