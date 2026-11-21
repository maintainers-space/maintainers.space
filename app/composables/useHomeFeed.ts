import { cached, TTL } from '~/lib/cache'
import { forgeIdOf } from '~/lib/forges/registry'
import { canListMyWork, loadMyWork } from '~/lib/work'
import type { MyWork, WorkItem } from '~/lib/work'

function byRecent(a: WorkItem, b: WorkItem): number {
  return new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime()
}

/** Concatenate two lists and sort newest-first (used by the streaming merge). */
function concatWork(a: WorkItem[], b: WorkItem[]): WorkItem[] {
  return [...a, ...b].sort(byRecent)
}

const EMPTY: MyWork = { assignedIssues: [], authoredPulls: [], reviewRequests: [] }

/**
 * Actionable "what should I work on next" feed for the signed-in home page.
 * Pools every connected forge via thread search, so the buckets mix providers
 * with no visible separation. Cached for ~1 minute (status-y data) and
 * force-refetched by the reload button.
 */
export function useHomeFeed() {
  const { tokens } = useForgeTokens()
  const { forges } = useForges()

  const myPulls = ref<WorkItem[]>([])
  const reviewRequests = ref<WorkItem[]>([])
  const assignedIssues = ref<WorkItem[]>([])
  const loading = ref(false)
  const loaded = ref(false)

  /** Forges that can produce a "my work" feed and have a connected account. */
  const workForges = () =>
    forges.value.providers.filter((f) => canListMyWork(f) && !!tokens.value[forgeIdOf(f)])
  const connected = computed(() => workForges().length > 0)

  function apply(work: MyWork): void {
    myPulls.value = [...work.authoredPulls].sort(byRecent)
    reviewRequests.value = [...work.reviewRequests].sort(byRecent)
    assignedIssues.value = [...work.assignedIssues].sort(byRecent)
  }

  /**
   * Anything you participated in is kept offline along with its repo, even if
   * you never opened the detail page — this is the "participated/watched" set.
   * Called once per load (after the aggregate is final), not per streamed slice,
   * so watchDetail isn't doing hundreds of localStorage writes per slice.
   */
  function recordWatched(work: MyWork): void {
    const offline = useOfflineRepos()
    const items = [...work.authoredPulls, ...work.reviewRequests, ...work.assignedIssues]
    for (const it of items) {
      offline.watch(it.isPull ? 'pull' : 'issue', it.provider, it.repo.owner, it.repo.name, it.id)
    }
  }

  async function load(force = false): Promise<void> {
    const active = workForges()
    if (!active.length) {
      loaded.value = true
      return
    }
    loading.value = true
    const key = `home:mywork:${active
      .map((f) => forgeIdOf(f))
      .sort()
      .join(',')}`
    try {
      // Stream: paint each forge's slice the moment it resolves so the first
      // data shows immediately and the rest fills in as it arrives. Passing the
      // streaming aggregator straight to `cached` keeps the offline/warm-cache
      // behaviour: when a copy is already stored it renders instantly, and the
      // fetcher only runs (painting slices) when a fresh fetch is needed.
      const streamAndAggregate = async (): Promise<MyWork> => {
        // Track the newest slice per provider, seeded from what is already on
        // screen (so a revalidation never shrinks the rendered feed).
        const slices = new Map<string, MyWork>()
        const seedSlice = (p: string, kind: keyof MyWork, items: WorkItem[]): void => {
          if (!items.length) return
          const entry = slices.get(p) ?? {
            assignedIssues: [],
            authoredPulls: [],
            reviewRequests: []
          }
          entry[kind].push(...items)
          slices.set(p, entry)
        }
        for (const it of myPulls.value) seedSlice(it.provider, 'authoredPulls', [it])
        for (const it of reviewRequests.value) seedSlice(it.provider, 'reviewRequests', [it])
        for (const it of assignedIssues.value) seedSlice(it.provider, 'assignedIssues', [it])

        const mergeAll = (): MyWork => {
          const acc: MyWork = { assignedIssues: [], authoredPulls: [], reviewRequests: [] }
          for (const p of slices.values()) {
            acc.authoredPulls = concatWork(acc.authoredPulls, p.authoredPulls)
            acc.reviewRequests = concatWork(acc.reviewRequests, p.reviewRequests)
            acc.assignedIssues = concatWork(acc.assignedIssues, p.assignedIssues)
          }
          return acc
        }
        await Promise.all(
          active.map((f) =>
            loadMyWork(f)
              .then((work) => {
                // Replace this provider's slice — never concatenate — so a force
                // refresh doesn't duplicate items that were already on screen.
                slices.set(forgeIdOf(f), work)
                apply(mergeAll())
              })
              .catch(() => {
                slices.set(forgeIdOf(f), EMPTY)
                apply(mergeAll())
              })
          )
        )
        return mergeAll()
      }
      const work = await cached(key, streamAndAggregate, {
        ttl: TTL.SHORT,
        force,
        onRevalidate: apply
      })
      apply(work)
      recordWatched(work)
    } finally {
      loading.value = false
      loaded.value = true
    }
  }

  return { myPulls, reviewRequests, assignedIssues, loading, loaded, connected, load }
}
