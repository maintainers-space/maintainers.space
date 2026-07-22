import { getForge } from '~/lib/forges'
import { fetchFollows } from '~/lib/atproto/public'
import type { ForgeRepo } from '~/types/forge'

export type ExploreScope = 'trending' | 'following'
export type ExplorePeriod = 'daily' | 'weekly' | 'monthly'

export interface ExploreOptions {
  scope?: ExploreScope
  period?: ExplorePeriod
  language?: string
  limit?: number
}

function sinceDate(period: ExplorePeriod): string {
  const d = new Date()
  const days = period === 'daily' ? 1 : period === 'weekly' ? 7 : 30
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

/** Bounded-concurrency map so "following" fan-out stays responsive. */
async function mapLimit<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const idx = cursor++
      results[idx] = await fn(items[idx]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) || 1 }, worker))
  return results
}

function dedupe(list: ForgeRepo[]): ForgeRepo[] {
  const seen = new Set<string>()
  return list.filter((r) => {
    const key = `${r.provider}:${r.fullName}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Rewrite a Tangled repo listed by DID to display the follower's handle. */
function withOwner(r: ForgeRepo, owner: string): ForgeRepo {
  if (r.owner === owner) return r
  return {
    ...r,
    owner,
    fullName: `${owner}/${r.name}`,
    url: `https://tangled.org/${owner}/${r.name}`,
    ownerUrl: `https://tangled.org/${owner}`
  }
}

/** Cross-provider discovery feed (trending / popular / following). */
export function useExplore() {
  const { get: getToken } = useForgeTokens()
  const { isAuthenticated, did } = useAuth()

  const repos = ref<ForgeRepo[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const notes = ref<string[]>([])

  let token = 0

  function githubQuery(period: ExplorePeriod, language?: string): string {
    const parts: string[] = []
    parts.push(`created:>=${sinceDate(period)}`, 'stars:>1')
    if (language) parts.push(`language:${language}`)
    return parts.join(' ')
  }

  async function loadDiscovery(
    period: ExplorePeriod,
    limit: number,
    language: string | undefined,
    collected: ForgeRepo[],
    noteSet: Set<string>
  ): Promise<void> {
    const gh = getForge('github')
    if (gh?.searchRepos) {
      try {
        const res = await gh.searchRepos(githubQuery(period, language), {
          sort: 'stars',
          order: 'desc',
          limit,
          token: getToken('github')
        })
        collected.push(...res.items)
      } catch {
        noteSet.add('GitHub discovery is temporarily unavailable (rate limit).')
      }
    }

    // Tangled has no search API — surface a small curated set so the feed
    // still feels cross-provider.
    const tangled = getForge('tangled')
    if (tangled?.listRepos) {
      try {
        const featured = await tangled.listRepos('tangled.org')
        collected.push(...featured.slice(0, 4))
      } catch {
        /* best-effort */
      }
    }
  }

  async function loadFollowing(collected: ForgeRepo[], noteSet: Set<string>): Promise<void> {
    if (!isAuthenticated.value) {
      noteSet.add('Sign in to see repositories from the people you follow.')
      return
    }

    // GitHub: people you follow (users only, no orgs).
    const gh = getForge('github')
    if (gh?.listFollowedRepos) {
      const ghToken = getToken('github')
      if (ghToken) {
        try {
          collected.push(...await gh.listFollowedRepos({ token: ghToken }))
        } catch {
          noteSet.add('Could not load repositories from your GitHub follows.')
        }
      } else {
        noteSet.add('Connect your GitHub account to include the people you follow there.')
      }
    }

    // Tangled / atproto: accounts you follow on the social graph.
    const tangled = getForge('tangled')
    const viewer = did.value
    if (tangled?.listRepos && viewer) {
      try {
        const follows = await fetchFollows(viewer, 60)
        const chunks = await mapLimit(follows, 6, async (f) => {
          try {
            const list = await tangled.listRepos!(f.did)
            const owner = f.handle && !f.handle.endsWith('.invalid') ? f.handle : f.did
            return list.map(r => withOwner(r, owner))
          } catch {
            return [] as ForgeRepo[]
          }
        })
        collected.push(...chunks.flat())
      } catch {
        /* best-effort */
      }
    }

    if (!collected.length && !noteSet.size) {
      noteSet.add('No repositories from the accounts you follow yet.')
    }
  }

  async function load(opts: ExploreOptions = {}): Promise<void> {
    const scope = opts.scope ?? 'trending'
    const period = opts.period ?? 'weekly'
    const limit = opts.limit ?? 15
    const my = ++token
    loading.value = true
    error.value = null
    const noteSet = new Set<string>()
    const collected: ForgeRepo[] = []

    try {
      if (scope === 'following') {
        await loadFollowing(collected, noteSet)
      } else {
        await loadDiscovery(period, limit, opts.language, collected, noteSet)
      }
      if (my !== token) return
      repos.value = dedupe(collected)
      notes.value = [...noteSet]
    } finally {
      if (my === token) loading.value = false
    }
  }

  return { repos, loading, error, notes, load }
}
