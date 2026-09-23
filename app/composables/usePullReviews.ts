import type { Ref } from 'vue'
import type { ForgePullReview, ForgePullReviewComment, RepoLocator } from '~/types/forge'
import type { PullReader } from '~/types/features'
import { useRepoContext } from '~/composables/useRepoContext'
import { cached, invalidate, TTL } from '~/lib/cache'
import { findReviewComment } from '~/lib/pull-timeline'

interface PullReviewActivity {
  reviews: ForgePullReview[]
  threads: ForgePullReviewComment[]
}

async function fetchPullReviewActivity(
  reader: Pick<PullReader, 'listPullReviews'> & Partial<Pick<PullReader, 'listPullReviewThreads'>>,
  repo: RepoLocator,
  id: string
): Promise<PullReviewActivity> {
  const listAllReviews = async (): Promise<ForgePullReview[]> => {
    const reviews: ForgePullReview[] = []
    let cursor: string | undefined
    do {
      const page = await reader.listPullReviews(repo, id, { cursor, limit: 100 })
      reviews.push(...page.items)
      cursor = page.cursor
    } while (cursor)
    return reviews
  }
  const [reviews, threads] = await Promise.all([
    listAllReviews(),
    reader.listPullReviewThreads?.(repo, id) ?? []
  ])
  return { reviews, threads }
}

export function usePullReviews(itemKey: Ref<string>, id: Ref<string>) {
  const { forge, locator, meta } = useRepoContext()
  const reviews = ref<ForgePullReview[]>([])
  const threads = ref<ForgePullReviewComment[]>([])
  const status = ref<'idle' | 'pending' | 'success' | 'error'>('idle')
  const supported = computed(() => !!forge.value?.features.pullRead?.listPullReviews)
  let generation = 0

  const cacheKey = () => `${itemKey.value}:review-activity`

  function apply(activity: PullReviewActivity): void {
    reviews.value = activity.reviews
    threads.value = activity.threads
    status.value = 'success'
  }

  function reset(): void {
    generation++
    reviews.value = []
    threads.value = []
    status.value = 'idle'
  }

  async function load(force = false): Promise<void> {
    const reader = forge.value?.features.pullRead
    const listPullReviews = reader?.listPullReviews
    if (!listPullReviews || status.value === 'pending' || status.value === 'success') return
    const run = ++generation
    const currentLocator = locator.value
    const currentId = id.value
    const persist = !meta.value?.isPrivate
    const key = cacheKey()
    status.value = 'pending'
    try {
      if (!persist) invalidate(key)
      const activity = await cached(
        key,
        () =>
          fetchPullReviewActivity(
            { listPullReviews, listPullReviewThreads: reader.listPullReviewThreads },
            currentLocator,
            currentId
          ),
        {
          ttl: TTL.MEDIUM,
          persist,
          force,
          onRevalidate: (fresh) => {
            if (run === generation) apply(fresh)
          }
        }
      )
      if (run === generation) apply(activity)
    } catch {
      if (run === generation) status.value = 'error'
    }
  }

  async function reload(): Promise<void> {
    reset()
    await load(true)
  }

  function addReply(reply: ForgePullReviewComment): void {
    const parent = reply.replyToId ? findReviewComment(threads.value, reply.replyToId) : undefined
    if (parent) (parent.replies ??= []).push(reply)
    else threads.value.push(reply)
    invalidate(cacheKey())
  }

  watch(itemKey, reset, { immediate: true })

  return { reviews, threads, status, supported, load, reload, addReply }
}
