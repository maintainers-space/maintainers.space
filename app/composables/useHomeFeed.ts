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
  const { did, profile } = useAuth()

  const myPulls = ref<ForgeIssue[]>([])
  const reviewRequests = ref<ForgeIssue[]>([])
  const assignedIssues = ref<ForgeIssue[]>([])
  const loading = ref(false)
  const loaded = ref(false)

  /** Tangled has no OAuth token — it authenticates via the signed-in atproto identity. */
  function tangledSelf(): string | undefined {
    const h = profile.value?.handle
    if (h && !h.startsWith('did:')) return h
    return did.value ?? undefined
  }

  /** Forges that can produce a "my work" feed and have a connected identity. */
  const workForges = () =>
    forgeList.filter(
      (f) => f.listMyWork && (f.id === 'tangled' ? !!tangledSelf() : !!getToken(f.id))
    )
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
      // Stream: paint each forge's slice the moment it resolves so the first
      // data shows immediately and the rest fills in as it arrives. Passing the
      // streaming aggregator straight to `cached` keeps the offline/warm-cache
      // behaviour: when a copy is already stored it renders instantly, and the
      // fetcher only runs (painting slices) when a fresh fetch is needed.
      const streamAndAggregate = async (): Promise<ForgeMyWork> => {
        const parts = await Promise.all(
          active.map((f) =>
            f
              .listMyWork!(
                f.id === 'tangled' ? { viewer: tangledSelf() } : { token: getToken(f.id) }
              )
              .then((work) => {
                apply(work)
                return work
              })
              .catch(() => {
                const empty: ForgeMyWork = { authoredPulls: [], reviewRequests: [], assignedIssues: [] }
                apply(empty)
                return empty
              })
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
      }
      const work = await cached(key, streamAndAggregate, {
        ttl: TTL.SHORT,
        force,
        onRevalidate: apply
      })
      apply(work)
    } finally {
      loading.value = false
      loaded.value = true
    }
  }

  return { myPulls, reviewRequests, assignedIssues, loading, loaded, connected, load }
}
