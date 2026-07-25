import type { Ref } from 'vue'
import type { LocationQueryRaw, LocationQueryValue } from 'vue-router'

/**
 * A tab/selection ref that mirrors a URL query parameter so tab state is
 * shareable, restored on reload, and — crucially — navigable with the browser
 * back/forward buttons.
 *
 * Selecting a tab does a `router.push`, so each change is its own history entry
 * (Back returns to the previously viewed tab). Programmatic syncs coming *from*
 * a history navigation are guarded so they don't push a duplicate entry.
 *
 * The `fallback` value is treated as the "clean" state and omitted from the URL
 * to keep canonical links tidy.
 */
export function useRouteTab<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T
): Ref<T> {
  const route = useRoute()
  const router = useRouter()

  const read = (v: LocationQueryValue | LocationQueryValue[] | undefined): T => {
    const raw = Array.isArray(v) ? v[0] : v
    return allowed.includes(raw as T) ? (raw as T) : fallback
  }

  const tab = ref(read(route.query[key])) as Ref<T>
  let syncing = false

  watch(tab, (v) => {
    if (syncing) return
    const query: LocationQueryRaw = { ...route.query }
    if (v === fallback) query[key] = undefined
    else query[key] = v
    router.push({ query })
  })

  watch(
    () => route.query[key],
    (v) => {
      const next = read(v)
      if (next !== tab.value) {
        syncing = true
        tab.value = next
        nextTick(() => {
          syncing = false
        })
      }
    }
  )

  return tab
}
