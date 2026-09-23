import { forgeList, getForge } from '~/lib/forges'
import { fetchFollows } from '~/lib/atproto/public'
import { cached, TTL } from '~/lib/cache'
import { balanceByDominance } from '~/lib/forge-balance'
import type { ForgeRepo } from '~/types/forge'

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

function dedupe(repos: ForgeRepo[]): ForgeRepo[] {
  const seen = new Set<string>()
  return repos.filter((repo) => {
    const key = `${repo.provider}:${repo.fullName}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Rewrite a Tangled repo listed by DID to display the followed account's handle. */
function withOwner(repo: ForgeRepo, owner: string): ForgeRepo {
  if (repo.owner === owner) return repo
  return {
    ...repo,
    owner,
    fullName: `${owner}/${repo.name}`,
    url: `https://tangled.org/${owner}/${repo.name}`,
    ownerUrl: `https://tangled.org/${owner}`
  }
}

/** Repositories maintained by accounts the signed-in viewer follows. */
export function useFollowingRepositories() {
  const { get: getToken } = useForgeTokens()
  const { did, isAuthenticated } = useAuth()

  const repos = ref<ForgeRepo[]>([])
  const loading = ref(false)
  let request = 0

  async function fetchRepos(): Promise<ForgeRepo[]> {
    const collected: ForgeRepo[] = []

    await Promise.all(
      forgeList.map(async (forge) => {
        if (!forge.features.repoRead.listFollowedRepos) return
        const token = getToken(forge.id)
        if (!token) return
        try {
          collected.push(...(await forge.features.repoRead.listFollowedRepos!({ token })))
        } catch {
          /* A single unavailable forge must not hide results from the others. */
        }
      })
    )

    const tangled = getForge('tangled')
    if (tangled?.features.repoRead.listRepos && did.value) {
      try {
        const follows = await fetchFollows(did.value, 60)
        const chunks = await mapLimit(follows.slice(0, 12), 3, async (follow) => {
          try {
            const list = await tangled.features.repoRead.listRepos!(follow.did)
            const owner =
              follow.handle && !follow.handle.endsWith('.invalid') ? follow.handle : follow.did
            return list.map((repo) => withOwner(repo, owner))
          } catch {
            return [] as ForgeRepo[]
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
