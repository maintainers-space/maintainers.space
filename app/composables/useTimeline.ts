import { forgeList } from '~/lib/forges'
import { fetchFollows } from '~/lib/atproto/public'
import { cached, TTL } from '~/lib/cache'
import type { ForgeContribution } from '~/types/forge'

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
function meaningful(c: ForgeContribution): boolean {
  return c.kind !== 'star' && c.kind !== 'other'
}

function dedupe(items: ForgeContribution[]): ForgeContribution[] {
  const seen = new Set<string>()
  return items.filter((c) => {
    const key = `${c.provider}:${c.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Collapse every event about the same PR/issue (opened, reviewed, commented,
 * merged, ...) into the single highest-impact one, so one subject reads as
 * one entry — e.g. "merged #67 <title>" — instead of a burst of near-
 * duplicate rows. Events with no subject number (push, create, release, fork)
 * have nothing to group by and pass through unchanged.
 */
function consolidate(items: ForgeContribution[]): ForgeContribution[] {
  const bySubject = new Map<string, ForgeContribution>()
  const rest: ForgeContribution[] = []
  for (const c of items) {
    if (c.number == null) {
      rest.push(c)
      continue
    }
    const key = `${c.provider}:${c.repo.fullName}:${c.number}`
    const existing = bySubject.get(key)
    if (!existing || (c.impact ?? 0) > (existing.impact ?? 0)) bySubject.set(key, c)
  }
  return [...rest, ...bySubject.values()]
}

/**
 * Turn a pooled friends feed into a real chronological timeline: newest first,
 * capped per author so one prolific person can't flood the feed, and capped per
 * provider so a single forge (GitHub's events API is simply chattier than the
 * others) can't crowd out the rest — each is capped to at most half the feed.
 * Bounded to a sane maximum. Low-signal noise (stars) is already filtered upstream.
 */
function selectFriends(items: ForgeContribution[], cap = 6, max = 80): ForgeContribution[] {
  const sorted = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const perAuthor = new Map<string, number>()
  const perProvider = new Map<string, number>()
  const providerCap = Math.max(1, Math.ceil(max / 2))
  const out: ForgeContribution[] = []
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
  const { get: getToken } = useForgeTokens()
  const { accounts, loaded, refresh } = useForgeAccounts()
  const { did, profile } = useAuth()

  const meItems = ref<ForgeContribution[]>([])
  const friendsItems = ref<ForgeContribution[]>([])
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

  /** Pool "my recent activity" across every forge that exposes an events feed. */
  async function gatherMe(): Promise<ForgeContribution[]> {
    if (!loaded.value) await refresh()
    const jobs: Promise<ForgeContribution[]>[] = []
    for (const forge of forgeList) {
      if (!forge.listUserEvents) continue
      if (forge.id === 'tangled') {
        const self = tangledSelf()
        if (self)
          jobs.push(
            forge.listUserEvents(self, { limit: 100 }).catch(() => [] as ForgeContribution[])
          )
        continue
      }
      const token = getToken(forge.id)
      if (!token) continue
      for (const login of loginsFor(forge.id)) {
        jobs.push(
          forge.listUserEvents(login, { token, limit: 100 }).catch(() => [] as ForgeContribution[])
        )
      }
    }
    const chunks = await Promise.all(jobs)
    return consolidate(dedupe(chunks.flat()).filter(meaningful)).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    )
  }

  /** Pool "activity from people you follow" across every forge. */
  async function gatherFriends(): Promise<ForgeContribution[]> {
    if (!loaded.value) await refresh()
    const buckets = await Promise.all(
      forgeList.map(async (forge) => {
        if (!forge.listUserEvents) return [] as ForgeContribution[]

        if (forge.id === 'tangled') {
          const self = did.value
          if (!self) return [] as ForgeContribution[]
          const follows = await fetchFollows(self, 60).catch(() => [])
          // Bobbin's rate limit is shared across every maintainers.space user on the same
          // proxy, so keep this fan-out modest rather than bursting requests.
          const chunks = await mapLimit(follows.slice(0, 12), 3, (f) =>
            forge.listUserEvents!(f.did, { limit: 100 }).catch(() => [] as ForgeContribution[])
          )
          return chunks.flat()
        }

        const token = getToken(forge.id)
        if (!token || !forge.listFollowing) return [] as ForgeContribution[]
        const users = await forge.listFollowing({ token, limit: 100 }).catch(() => [])
        const chunks = await mapLimit(users.slice(0, 20), 6, (u) =>
          forge.listUserEvents!(u.login, { token, limit: 100 }).catch(
            () => [] as ForgeContribution[]
          )
        )
        return chunks.flat()
      })
    )
    return consolidate(dedupe(buckets.flat()).filter(meaningful))
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
