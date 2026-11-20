import { fetchFollows } from '~/lib/atproto/public'
import { cached, TTL } from '~/lib/cache'
import type { Contribution } from '~/lib/activity'
import { listFollowing, listUserEvents } from '~/lib/forges/gaps/social'
import { listTangledRepos } from '~/lib/forges/gaps/tangled'
import { forgeIdOf } from '~/lib/forges/registry'

/** Bounded-concurrency map so the friends fan-out stays responsive. */
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

/** Drop low-signal noise: starring repos, and the generic "was active" fallback that carries no real subject. */
function meaningful(c: Contribution): boolean {
  return c.kind !== 'star' && c.kind !== 'other'
}

function dedupe(items: Contribution[]): Contribution[] {
  const seen = new Set<string>()
  return items.filter((c) => {
    const key = `${c.provider}:${c.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Turn a pooled friends feed into a real chronological timeline: newest first,
 * capped per author so one prolific person can't flood the feed, and capped per
 * provider so a single forge (GitHub's events API is simply chattier than the
 * others) can't crowd out the rest — each is capped to at most half the feed.
 * Bounded to a sane maximum. Low-signal noise (stars) is already filtered upstream.
 */
function selectFriends(items: Contribution[], cap = 6, max = 80): Contribution[] {
  const sorted = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const perAuthor = new Map<string, number>()
  const perProvider = new Map<string, number>()
  const providerCap = Math.max(1, Math.ceil(max / 2))
  const out: Contribution[] = []
  for (const it of sorted) {
    const authorCount = perAuthor.get(it.actor.login) ?? 0
    if (authorCount >= cap) continue
    const providerCount = perProvider.get(it.provider) ?? 0
    if (providerCount >= providerCap) continue
    perAuthor.set(it.actor.login, authorCount + 1)
    perProvider.set(it.provider, providerCount + 1)
    out.push(it)
    if (out.length >= max) break
  }
  return out
}

/** Cross-forge activity timeline: your own contributions and your friends'. */
export function useTimeline() {
  const { tokens } = useForgeTokens()
  const { forges } = useForges()
  const { accounts, loaded, refresh } = useForgeAccounts()
  const { did, profile } = useAuth()

  const meItems = ref<Contribution[]>([])
  const friendsItems = ref<Contribution[]>([])
  const meLoading = ref(false)
  const friendsLoading = ref(false)
  const meLoaded = ref(false)
  const friendsLoaded = ref(false)
  const meNote = ref<string | null>(null)
  const friendsNote = ref<string | null>(null)

  function loginsFor(provider: string): string[] {
    return (accounts.value ?? []).filter((a) => a.provider === provider).map((a) => a.username)
  }

  /** The viewer's Tangled identity (handle preferred, DID fallback). */
  function tangledSelf(): string | null {
    const h = profile.value?.handle
    if (h && !h.startsWith('did:')) return h
    return did.value ?? null
  }

  /** Tangled has no event feed, so a person's new repositories stand in for their activity. */
  async function tangledActivity(handle: string): Promise<Contribution[]> {
    const tangled = forges.value.get('tangled')
    if (!tangled) return []
    const repos = await listTangledRepos(tangled, handle)
    return repos.flatMap((repo) => {
      const name = (repo.raw as { record: { name?: string } }).record.name ?? repo.ref.name
      if (!repo.createdAt) return []
      return [
        {
          actor: { login: handle },
          createdAt: repo.createdAt.toISOString(),
          id: `repo:${repo.ref.externalId ?? repo.ref.name}`,
          impact: 3,
          kind: 'create' as const,
          provider: 'tangled',
          refType: 'repository',
          repo: { fullName: `${handle}/${name}`, name, owner: handle, url: repo.url },
          title: name,
          url: `/tangled/${handle}/${name}`
        }
      ]
    })
  }

  /** Pool "my recent activity" across every forge that exposes an events feed. */
  async function gatherMe(): Promise<Contribution[]> {
    if (!loaded.value) await refresh()
    const jobs: Promise<Contribution[]>[] = []
    for (const forge of forges.value.providers) {
      const id = forgeIdOf(forge)
      if (forge.forge === 'tangled') {
        const self = tangledSelf()
        if (self) jobs.push(tangledActivity(self).catch(() => []))
        continue
      }
      if (!tokens.value[id]) continue
      for (const login of loginsFor(id)) {
        jobs.push(listUserEvents(forge, login).catch(() => [] as Contribution[]))
      }
    }
    const chunks = await Promise.all(jobs)
    return dedupe(chunks.flat())
      .filter(meaningful)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  /** Pool "activity from people you follow" across every forge. */
  async function gatherFriends(): Promise<Contribution[]> {
    if (!loaded.value) await refresh()
    const buckets = await Promise.all(
      forges.value.providers.map(async (forge) => {
        if (forge.forge === 'tangled') {
          const self = did.value
          if (!self) return [] as Contribution[]
          const follows = await fetchFollows(self, 60).catch(() => [])
          // Bobbin's rate limit is shared across every maintainers.space user on the same
          // proxy, so keep this fan-out modest rather than bursting requests.
          const chunks = await mapLimit(follows.slice(0, 12), 3, (f) =>
            tangledActivity(f.did).catch(() => [] as Contribution[])
          )
          return chunks.flat()
        }

        if (!tokens.value[forgeIdOf(forge)]) return [] as Contribution[]
        const users = await listFollowing(forge).catch(() => [])
        const chunks = await mapLimit(users.slice(0, 20), 6, (u) =>
          listUserEvents(forge, u.login).catch(() => [] as Contribution[])
        )
        return chunks.flat()
      })
    )
    return dedupe(buckets.flat()).filter(meaningful)
  }

  async function loadMe(force = false): Promise<void> {
    meLoading.value = true
    meNote.value = null
    try {
      const items = await cached('timeline:me', gatherMe, { ttl: TTL.MEDIUM, force })
      meItems.value = items
      if (!items.length) meNote.value = 'Connect a forge account to see your recent activity.'
    } finally {
      meLoading.value = false
      meLoaded.value = true
    }
  }

  async function loadFriends(force = false): Promise<void> {
    friendsLoading.value = true
    friendsNote.value = null
    try {
      const all = await cached('timeline:friends', gatherFriends, { ttl: TTL.MEDIUM, force })
      friendsItems.value = selectFriends(all)
      if (!friendsItems.value.length) {
        friendsNote.value =
          'No recent activity from the people you follow — follow a few people to build your feed.'
      }
    } finally {
      friendsLoading.value = false
      friendsLoaded.value = true
    }
  }

  return {
    meItems,
    friendsItems,
    meLoading,
    friendsLoading,
    meLoaded,
    friendsLoaded,
    meNote,
    friendsNote,
    loadMe,
    loadFriends
  }
}
