import { fetchFollows } from '~/lib/atproto/public'
import { cached, TTL } from '~/lib/cache'
import { balanceByDominance } from '~/lib/forge-balance'
import { listFollowedRepos } from '~/lib/forges/gaps/social'
import { listTangledRepos } from '~/lib/forges/gaps/tangled'
import { forgeIdOf } from '~/lib/forges/registry'
import { toRepoCard } from '~/lib/forges/view'
import type { RepoCard } from '~/lib/forges/view'

/** Bounded-concurrency map so the Tangled repository fan-out stays responsive. */
async function mapLimit<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length })
  let cursor = 0
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await fn(items[index]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) || 1 }, worker))
  return results
}

function dedupe(repos: RepoCard[]): RepoCard[] {
  const seen = new Set<string>()
  return repos.filter((repo) => {
    const key = `${repo.provider}:${repo.fullName}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Repositories maintained by accounts the signed-in viewer follows. */
export function useFollowingRepositories() {
  const { tokens } = useForgeTokens()
  const { forges } = useForges()
  const { did, isAuthenticated } = useAuth()

  const repos = ref<RepoCard[]>([])
  const loading = ref(false)
  let request = 0

  async function fetchRepos(): Promise<RepoCard[]> {
    const collected: RepoCard[] = []

    await Promise.all(
      forges.value.providers.map(async (forge) => {
        if (forge.forge === 'tangled' || !tokens.value[forgeIdOf(forge)]) return
        try {
          collected.push(...(await listFollowedRepos(forge)))
        } catch {
          /* A single unavailable forge must not hide results from the others. */
        }
      })
    )

    const tangled = forges.value.get('tangled')
    if (tangled && did.value) {
      try {
        const follows = await fetchFollows(did.value, 60)
        const chunks = await mapLimit(follows.slice(0, 12), 3, async (follow) => {
          try {
            const owner =
              follow.handle && !follow.handle.endsWith('.invalid') ? follow.handle : follow.did
            return (await listTangledRepos(tangled, owner)).map(toRepoCard)
          } catch {
            return [] as RepoCard[]
          }
        })
        collected.push(...chunks.flat())
      } catch {
        /* Public follow data is optional. */
      }
    }

    const ranked = dedupe(collected).sort((a, b) =>
      String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? ''))
    )
    return balanceByDominance(ranked)
  }

  async function load(): Promise<void> {
    if (!isAuthenticated.value) {
      repos.value = []
      return
    }

    const currentRequest = ++request
    loading.value = true
    try {
      const result = await cached(`following-repositories:${did.value ?? 'unknown'}`, fetchRepos, {
        ttl: TTL.MEDIUM
      })
      if (currentRequest === request) repos.value = result
    } finally {
      if (currentRequest === request) loading.value = false
    }
  }

  return { repos, loading, load }
}
