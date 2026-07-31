import type { AsyncData, AsyncDataOptions, NuxtError } from '#app'
import type { Ref } from 'vue'
import { cached, TTL } from '~/lib/cache'

// Nuxt's own `AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>` defaults
// `DefaultT` to `undefined`, not `ResT` — fine for `useAsyncData` itself
// (its overloads infer `DefaultT` straight from the `default` literal at each
// call site), but a plain single-argument `AsyncDataOptions<T>` annotation
// fixes `default`'s type to `() => undefined`. Every call site here passes an
// explicit `T` anyway (matching the existing convention for detail pages), so
// a second inferred generic wouldn't help — TypeScript doesn't do partial
// inference when some type arguments are given explicitly. Instead, type
// `default` against `T` itself: callers that use it always return a `T`.
type LiveAsyncDataOptions<T> = Omit<AsyncDataOptions<T>, 'default'> & {
  default?: () => T | Ref<T>
}

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
 *
 * The handler is also routed through the persisted, offline-aware cache
 * (~/lib/cache), so every page built on this composable (repo metadata,
 * issues/PRs/discussions/commits/blobs, owner and profile pages) survives a
 * full reload and keeps showing its last known data with no network at all.
 */
export function useLiveAsyncData<T>(
  key: string | (() => string),
  handler: () => Promise<T>,
  options: LiveAsyncDataOptions<T> & LiveOptions = {}
): AsyncData<T | undefined, NuxtError> {
  const { staleAfter = TTL.SHORT, ...asyncOptions } = options
  const keyOf = typeof key === 'function' ? key : () => key
  const wrappedHandler = (): Promise<T> => cached(keyOf(), handler)
  const result = useAsyncData<T>(key, wrappedHandler, asyncOptions)

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

  return result as AsyncData<T | undefined, NuxtError>
}
