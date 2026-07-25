import { forgeList } from '~/lib/forges'
import { cached, TTL } from '~/lib/cache'
import type { ForgeIssue, ForgeMyWork } from '~/types/forge'

function byRecent(a: ForgeIssue, b: ForgeIssue): number {
  return new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime()
}

/**
 * Actionable "what should I work on next" feed for the signed-in home page.
 * Pools every connected forge (GitHub, GitLab, …) via each provider's
 * `listMyWork`, so the buckets mix providers with no visible separation. Cached
 * for ~1 minute (status-y data) and force-refetched by the reload button.
 */
export function useHomeFeed() {
  const { get: getToken } = useForgeTokens()

  const myPulls = ref<ForgeIssue[]>([])
  const reviewRequests = ref<ForgeIssue[]>([])
  const assignedIssues = ref<ForgeIssue[]>([])
  const loading = ref(false)
  const loaded = ref(false)

  /** Forges that can produce a "my work" feed and have a token connected. */
  const workForges = () => forgeList.filter((f) => f.listMyWork && getToken(f.id))
  const connected = computed(() => workForges().length > 0)

  function apply(work: ForgeMyWork): void {
    myPulls.value = [...work.authoredPulls].sort(byRecent)
    reviewRequests.value = [...work.reviewRequests].sort(byRecent)
    assignedIssues.value = [...work.assignedIssues].sort(byRecent)
  }

  async function load(force = false): Promise<void> {
    const active = workForges()
    if (!active.length) {
      loaded.value = true
      return
    }
    loading.value = true
    const key = `home:mywork:${active
      .map((f) => f.id)
      .sort()
      .join(',')}`
    try {
      const work = await cached(
        key,
        async () => {
          const parts = await Promise.all(
            active.map((f) =>
              f.listMyWork!({ token: getToken(f.id) }).catch(
                () =>
                  ({
                    authoredPulls: [],
                    reviewRequests: [],
                    assignedIssues: []
                  }) as ForgeMyWork
              )
            )
          )
          return parts.reduce<ForgeMyWork>(
            (acc, p) => ({
              authoredPulls: acc.authoredPulls.concat(p.authoredPulls),
              reviewRequests: acc.reviewRequests.concat(p.reviewRequests),
              assignedIssues: acc.assignedIssues.concat(p.assignedIssues)
            }),
            { authoredPulls: [], reviewRequests: [], assignedIssues: [] }
          )
        },
        { ttl: TTL.SHORT, force, onRevalidate: apply }
      )
      apply(work)
    } finally {
      loading.value = false
      loaded.value = true
    }
  }

  return { myPulls, reviewRequests, assignedIssues, loading, loaded, connected, load }
}
