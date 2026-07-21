import { getForge } from '~/lib/forges'
import type { ForgeRepo } from '~/types/forge'

export type ExploreScope = 'trending' | 'popular' | 'following'
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

/** Cross-provider discovery feed (trending / popular / following). */
export function useExplore() {
  const { get: getToken } = useForgeTokens()
  const { isAuthenticated } = useAuth()

  const repos = ref<ForgeRepo[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const notes = ref<string[]>([])

  let token = 0

  function githubQuery(o: Required<Pick<ExploreOptions, 'scope' | 'period'>> & ExploreOptions): string {
    const parts: string[] = []
    if (o.scope === 'trending') parts.push(`created:>=${sinceDate(o.period)}`, 'stars:>1')
    else if (o.scope === 'popular') parts.push('stars:>5000')
    else parts.push('stars:>1')
    if (o.language) parts.push(`language:${o.language}`)
    return parts.join(' ')
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
      const gh = getForge('github')
      if (gh?.searchRepos) {
        if (scope === 'following' && !isAuthenticated.value) {
          noteSet.add('Sign in to see repositories from people you follow.')
        } else {
          const q = githubQuery({ scope, period, language: opts.language })
          try {
            const res = await gh.searchRepos(q, {
              sort: 'stars',
              order: 'desc',
              limit,
              token: getToken('github')
            })
            if (my !== token) return
            collected.push(...res.items)
          } catch {
            noteSet.add('GitHub discovery is temporarily unavailable (rate limit).')
          }
        }
      }

      // Tangled has no search API — surface a small curated set so the feed
      // still feels cross-provider.
      const tangled = getForge('tangled')
      if (tangled?.listRepos && scope !== 'following') {
        try {
          const featured = await tangled.listRepos('tangled.org')
          if (my !== token) return
          collected.push(...featured.slice(0, 4))
        } catch {
          /* best-effort */
        }
      }

      if (my !== token) return
      repos.value = collected
      notes.value = [...noteSet]
    } finally {
      if (my === token) loading.value = false
    }
  }

  return { repos, loading, error, notes, load }
}
