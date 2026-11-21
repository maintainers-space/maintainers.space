import type { Review, ThreadRef } from 'forges'
import type { Ref } from 'vue'

import { useRepoContext } from '~/composables/useRepoContext'
import { cached, invalidate, TTL } from '~/lib/cache'

// The parameter is not called `ref`: that name would shadow Nuxt's auto-imported `ref()` below.
async function fetchReviews(
  provider: { threads: { reviews: (target: ThreadRef) => AsyncIterable<Review> } },
  target: ThreadRef
): Promise<Review[]> {
  const reviews: Review[] = []
  for await (const review of provider.threads.reviews(target)) reviews.push(review)
  return reviews
}

export function usePullReviews(itemKey: Ref<string>, threadRef: Ref<ThreadRef | undefined>) {
  const { forge, meta } = useRepoContext()
  const reviews = ref<Review[]>([])
  const status = ref<'idle' | 'pending' | 'success' | 'error'>('idle')
  const supported = computed(() => !!forge.value?.can('threads.reviews'))
  let generation = 0

  const cacheKey = () => `${itemKey.value}:review-activity`

  function reset(): void {
    generation++
    reviews.value = []
    status.value = 'idle'
  }

  async function load(force = false): Promise<void> {
    const f = forge.value
    const ref = threadRef.value
    if (!f || !ref || !supported.value || status.value === 'pending' || status.value === 'success')
      return
    const run = ++generation
    const persist = meta.value?.visibility === 'public'
    const key = cacheKey()
    status.value = 'pending'
    try {
      if (!persist) invalidate(key)
      const result = await cached(key, () => fetchReviews(f, ref), {
        ttl: TTL.MEDIUM,
        persist,
        force,
        onRevalidate: (fresh) => {
          if (run === generation) {
            reviews.value = fresh
            status.value = 'success'
          }
        }
      })
      if (run === generation) {
        reviews.value = result
        status.value = 'success'
      }
    } catch {
      if (run === generation) status.value = 'error'
    }
  }

  async function reload(): Promise<void> {
    invalidate(cacheKey())
    reset()
    await load(true)
  }

  watch(itemKey, reset, { immediate: true })

  return { reviews, status, supported, load, reload }
}
