import { forgeList, getForge } from '~/lib/forges'
import { fetchFollows } from '~/lib/atproto/public'
import { cached, TTL } from '~/lib/cache'
import { balanceByDominance } from '~/lib/forge-balance'
import type { ForgeId, ForgeRepo } from '~/types/forge'

/**
 * Owners surfaced as a small curated set for forges with no repo search API at
 * all. Placeholders, swap for better examples as each forge gains real traction.
 */
const FEATURED_OWNERS: Partial<Record<ForgeId, string>> = {
  tangled: 'tangled.org'
}

export type ExploreScope = 'trending' | 'following'
export type ExplorePeriod = 'daily' | 'weekly' | 'monthly'

export interface ExploreOptions {
  scope?: ExploreScope
  period?: ExplorePeriod
  language?: string
  limit?: number
  /** Bypass the client cache and refetch from every provider. */
  force?: boolean
}

function sinceDate(period: ExplorePeriod): string {
  const d = new Date()
  const days = period === 'daily' ? 1 : period === 'weekly' ? 7 : 30
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

/** Bounded-concurrency map so "following" fan-out stays responsive. */
async function mapLimit<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length })
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

/**
 * Sort a pooled cross-provider list so the grid reads as one mixed feed with no
 * per-provider sectioning: trending ranks by stars, following by recency.
 */
function sortRepos(list: ForgeRepo[], scope: ExploreScope): ForgeRepo[] {
  if (scope === 'trending') {
    return list.sort(
      (a, b) =>
        (b.stars ?? 0) - (a.stars ?? 0) ||
        String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? ''))
    )
  }
  return list.sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))
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

    // Every other forge with a plain-text repo search contributes a smaller,
    // stars-sorted slice — none of them support GitHub's date+stars qualifier
    // syntax (or a language facet), so the language filter only narrows GitHub's
    // slice of the mix.
    const plainTextQuery = language && language !== 'all' ? language : ''
    await Promise.all(
      forgeList
        .filter((f) => f.id !== 'github' && f.searchRepos)
        .map(async (f) => {
          try {
            const res = await f.searchRepos!(plainTextQuery, {
              sort: 'stars',
              order: 'desc',
              limit: Math.min(limit, 12),
              token: getToken(f.id)
            })
            collected.push(...res.items)
          } catch {
            /* best-effort */
          }
        })
    )

    // Forges with no search API at all get a small curated set instead.
    await Promise.all(
      Object.entries(FEATURED_OWNERS).map(async ([id, owner]) => {
        const forge = getForge(id)
        if (!forge?.listRepos || !owner) return
        try {
          const featured = await forge.listRepos(owner)
          collected.push(...featured.slice(0, 6))
        } catch {
          /* best-effort */
        }
      })
    )
  }

  async function loadFollowing(collected: ForgeRepo[], noteSet: Set<string>): Promise<void> {
    if (!isAuthenticated.value) {
      noteSet.add('Sign in to see repositories from the people you follow.')
      return
    }

    await Promise.all(
      forgeList.map(async (forge) => {
        if (!forge.listFollowedRepos) return
        const t = getToken(forge.id)
        if (!t) {
          if (forge.id !== 'tangled') {
            noteSet.add(
              `Connect your ${forge.label} account to include the people you follow there.`
            )
          }
          return
        }
        try {
          collected.push(...(await forge.listFollowedRepos({ token: t })))
        } catch {
          noteSet.add(`Could not load repositories from your ${forge.label} follows.`)
        }
      })
    )

    const tangled = getForge('tangled')
    const viewer = did.value
    if (tangled?.listRepos && viewer) {
      try {
        const follows = await fetchFollows(viewer, 60)
        // Bobbin's rate limit is shared across every maintainers.space user on the same
        // proxy, so keep this fan-out modest rather than bursting requests.
        const chunks = await mapLimit(follows.slice(0, 12), 3, async (f) => {
          try {
            const list = await tangled.listRepos!(f.did)
            const owner = f.handle && !f.handle.endsWith('.invalid') ? f.handle : f.did
            return list.map((r) => withOwner(r, owner))
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

    const key = `explore:${scope}:${period}:${opts.language ?? 'all'}`
    try {
      const result = await cached(
        key,
        async () => {
          const noteSet = new Set<string>()
          const collected: ForgeRepo[] = []
          if (scope === 'following') {
            await loadFollowing(collected, noteSet)
          } else {
            await loadDiscovery(period, limit, opts.language, collected, noteSet)
          }
          // Rank each provider's own repos first, then interleave providers by
          // their configured dominance so no single forge crowds out the rest.
          const ranked = sortRepos(dedupe(collected), scope)
          return { repos: balanceByDominance(ranked), notes: [...noteSet] }
        },
        { ttl: TTL.MEDIUM, force: opts.force }
      )

      if (my !== token) return
      repos.value = result.repos
      notes.value = result.notes
    } finally {
      if (my === token) loading.value = false
    }
  }

  return { repos, loading, error, notes, load }
}
