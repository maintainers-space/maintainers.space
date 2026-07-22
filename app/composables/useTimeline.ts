import { getForge } from '~/lib/forges'
import type { ForgeContribution } from '~/types/forge'

/** Bounded-concurrency map so the friends fan-out stays responsive. */
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

/** Drop low-signal noise (starring repos) from an activity feed. */
function meaningful(c: ForgeContribution): boolean {
  return c.kind !== 'star'
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
 * Rank a pooled friends feed by impact (merged PRs > releases > opened PRs > …),
 * breaking ties by recency and capping each author so one prolific person can't
 * dominate the highlights.
 */
function rankFriends(items: ForgeContribution[], cap = 5, max = 60): ForgeContribution[] {
  const sorted = [...items].sort((a, b) =>
    (b.impact ?? 0) - (a.impact ?? 0) || b.createdAt.localeCompare(a.createdAt)
  )
  const perAuthor = new Map<string, number>()
  const out: ForgeContribution[] = []
  for (const it of sorted) {
    const n = perAuthor.get(it.actor.login) ?? 0
    if (n >= cap) continue
    perAuthor.set(it.actor.login, n + 1)
    out.push(it)
    if (out.length >= max) break
  }
  return out
}

/** Cross-forge activity timeline: your own contributions and your friends'. */
export function useTimeline() {
  const { get: getToken } = useForgeTokens()
  const { accounts, loaded, refresh } = useForgeAccounts()

  const meItems = ref<ForgeContribution[]>([])
  const friendsItems = ref<ForgeContribution[]>([])
  const meLoading = ref(false)
  const friendsLoading = ref(false)
  const meLoaded = ref(false)
  const friendsLoaded = ref(false)
  const meNote = ref<string | null>(null)
  const friendsNote = ref<string | null>(null)

  const githubLogins = computed(() =>
    (accounts.value ?? []).filter(a => a.provider === 'github').map(a => a.username)
  )

  async function loadMe(): Promise<void> {
    const gh = getForge('github')
    const token = getToken('github')
    meLoading.value = true
    meNote.value = null
    try {
      if (!gh?.listUserEvents || !token) {
        meNote.value = 'Connect your GitHub account to see your recent activity.'
        meItems.value = []
        return
      }
      if (!loaded.value) await refresh()
      const logins = githubLogins.value
      if (!logins.length) {
        meNote.value = 'Link a GitHub account to see your recent activity.'
        meItems.value = []
        return
      }
      const chunks = await Promise.all(
        logins.map(l => gh.listUserEvents!(l, { token, limit: 100 }).catch(() => [] as ForgeContribution[]))
      )
      meItems.value = dedupe(chunks.flat())
        .filter(meaningful)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    } finally {
      meLoading.value = false
      meLoaded.value = true
    }
  }

  async function loadFriends(): Promise<void> {
    const gh = getForge('github')
    const token = getToken('github')
    friendsLoading.value = true
    friendsNote.value = null
    try {
      if (!gh?.listFollowing || !gh.listUserEvents || !token) {
        friendsNote.value = 'Connect your GitHub account to see what the people you follow are building.'
        friendsItems.value = []
        return
      }
      const users = await gh.listFollowing({ token, limit: 100 }).catch(() => [])
      if (!users.length) {
        friendsNote.value = 'You don\u2019t follow anyone on GitHub yet — follow a few people to build your feed.'
        friendsItems.value = []
        return
      }
      const chunks = await mapLimit(users.slice(0, 20), 6, u =>
        gh.listUserEvents!(u.login, { token, limit: 100 }).catch(() => [] as ForgeContribution[])
      )
      const all = dedupe(chunks.flat()).filter(meaningful)
      friendsItems.value = rankFriends(all)
      if (!friendsItems.value.length) friendsNote.value = 'No recent activity from the people you follow.'
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
