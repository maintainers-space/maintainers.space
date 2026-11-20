import { cached, invalidate, TTL } from '~/lib/cache'
import { loadInbox } from '~/lib/inbox'
import type { InboxItem } from '~/lib/inbox'
import { forgeIdOf, forgeList } from '~/lib/forges/registry'

/** localStorage key holding thread ids the user has completed. */
const DISMISSED_KEY = 'maintainers.space:inbox-dismissed'
const DISMISS_TTL = 30 * 86_400_000

/**
 * Persist completed notifications locally. Providers like Tangled have no
 * server-side read state, and even GitHub/GitLab benefit from an instant,
 * durable "done" that survives a reload — so every completion is remembered
 * here (pruned after 30 days) and filtered out of future loads.
 */
function loadDismissed(): Record<string, number> {
  if (!import.meta.client) return {}
  try {
    const raw = JSON.parse(localStorage.getItem(DISMISSED_KEY) || '{}') as Record<string, number>
    const now = Date.now()
    const kept: Record<string, number> = {}
    for (const [k, exp] of Object.entries(raw)) if (exp > now) kept[k] = exp
    return kept
  } catch {
    return {}
  }
}

function saveDismissed(map: Record<string, number>): void {
  if (import.meta.client) localStorage.setItem(DISMISSED_KEY, JSON.stringify(map))
}

/** A repo whose CI is failing repeatedly, collapsed from many check notifications. */
export interface CiFailureGroup {
  key: string
  repo: { owner: string; name: string; fullName: string }
  count: number
  latestAt?: string | null
  to?: string
  url?: string
  items: InboxItem[]
}

/** Per-kind/reason base weight for the importance score — higher sorts first. */
const KIND_WEIGHT: Record<InboxItem['kind'], number> = {
  mention: 100,
  pull: 70,
  issue: 55,
  ci: 45,
  discussion: 50,
  commit: 30,
  release: 25,
  other: 20
}

/** Reasons that signal the viewer is directly on the hook, boosted above the kind's base weight. */
const HOT_REASONS = new Set(['review_requested', 'mention', 'team_mention', 'assigned', 'author'])

/**
 * A single cross-forge priority score so the inbox reads as one ranked list
 * instead of "whichever provider's unread flag happened to be true": kind/reason
 * weight, a strong unread boost, a bot penalty, and exponential recency decay
 * (halving roughly every ~5 days) so a week-old unread review request still
 * outranks a stale, already-read ping.
 */
function computeImportance(item: InboxItem, now = Date.now()): number {
  let score = KIND_WEIGHT[item.kind] ?? KIND_WEIGHT.other
  if (item.reason && HOT_REASONS.has(item.reason.toLowerCase())) score += 40
  if (item.unread) score += 60
  if (item.isBot) score -= 35
  if (item.unreadComments?.length) score += 10 * Math.min(item.unreadComments.length, 3)

  const updated = item.updatedAt ? new Date(item.updatedAt).getTime() : NaN
  const ageDays = Number.isFinite(updated) ? Math.max(0, (now - updated) / 86_400_000) : NaN
  const decay = Number.isFinite(ageDays) ? Math.exp(-ageDays / 7) : 0.5
  return score * (0.4 + 0.6 * decay)
}

/**
 * Bundled, actionable notification inbox across every forge. GitHub items are
 * enriched (state, author, diff stat, unread comments), already-resolved pings
 * are dropped, and dependency-bot PRs are split out so they can be batch-merged.
 * State is shared (useState) so the index and group routes stay in sync.
 */
export function useNotifications() {
  const { tokens } = useForgeTokens()
  const { forges, providerFor } = useForges()
  const { did } = useAuth()
  const toast = useToast()

  const items = useState<InboxItem[]>('inbox-items', () => [])
  const loading = useState<boolean>('inbox-loading', () => false)
  const notes = useState<string[]>('inbox-notes', () => [])
  const loadedOnce = useState<boolean>('inbox-loaded', () => false)

  const resolvedItems = computed(() => items.value.filter((i) => i.resolved))
  const ciItems = computed(() =>
    items.value.filter((i) => i.kind === 'ci' && !i.isBot && !i.resolved)
  )
  const inboxItems = computed(() => {
    const now = Date.now()
    return items.value
      .filter((i) => !i.resolved && !i.isBot && i.kind !== 'ci')
      .map((i) => ({ item: i, score: computeImportance(i, now) }))
      .sort(
        (a, b) =>
          b.score - a.score ||
          new Date(b.item.updatedAt ?? 0).getTime() - new Date(a.item.updatedAt ?? 0).getTime()
      )
      .map((x) => x.item)
  })
  const unreadCount = computed(() => inboxItems.value.filter((i) => i.unread).length)
  const resolvedCount = computed(() => resolvedItems.value.length)

  /** Collapse repetitive CI-failure notifications into one entry per repo. */
  const ciGroups = computed<CiFailureGroup[]>(() => {
    const map = new Map<string, CiFailureGroup>()
    for (const it of ciItems.value) {
      if (!it.repo) continue
      const key = `${it.provider}:${it.repo.fullName}`
      const g = map.get(key)
      if (g) {
        g.count++
        g.items.push(it)
        if (it.updatedAt > (g.latestAt ?? '')) g.latestAt = it.updatedAt
      } else {
        map.set(key, {
          key,
          repo: it.repo,
          count: 1,
          latestAt: it.updatedAt,
          to: it.to,
          url: it.url,
          items: [it]
        })
      }
    }
    return [...map.values()].sort(
      (a, b) => b.count - a.count || (b.latestAt ?? '').localeCompare(a.latestAt ?? '')
    )
  })
  const ciCount = computed(() => ciItems.value.length)

  const hasSources = computed(
    () => forges.value.providers.some((f) => f.can('notifications.list')) || !!did.value
  )

  async function load(force = false): Promise<void> {
    loading.value = true
    const noteSet = new Set<string>()
    const collected: InboxItem[] = []
    const viewer = did.value ?? undefined

    await Promise.all(
      forges.value.providers.map(async (forge) => {
        const id = forgeIdOf(forge)
        if (!forge.can('notifications.list')) {
          // Forges that need an account nudge a signed-in viewer to connect, so a
          // missing forge is never silent.
          const descriptor = forgeList.find((f) => f.id === id)
          if (viewer && descriptor && id !== 'tangled' && !tokens.value[id])
            noteSet.add(
              `Connect your ${descriptor.label} account to include ${descriptor.label} notifications.`
            )
          return
        }
        try {
          const list = await cached(`inbox:${id}:${viewer ?? 'anon'}`, () => loadInbox(forge), {
            ttl: TTL.SHORT,
            force
          })
          collected.push(...list)
        } catch {
          noteSet.add(`Could not load ${id} notifications.`)
        }
      })
    )

    const dismissed = loadDismissed()
    const visible = collected.filter((i) => !dismissed[`${i.provider}:${i.id}`])

    // Providers are pooled then sorted by recency, never sectioned per-forge.
    visible.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    items.value = visible
    notes.value = [...noteSet]
    loading.value = false
    loadedOnce.value = true
  }

  /** Record a completion so it stays gone across reloads (all providers). */
  function rememberDismissed(list: InboxItem[]): void {
    const map = loadDismissed()
    const exp = Date.now() + DISMISS_TTL
    for (const it of list) map[`${it.provider}:${it.id}`] = exp
    saveDismissed(map)
  }

  function removeItem(item: InboxItem): void {
    items.value = items.value.filter((i) => !(i.provider === item.provider && i.id === item.id))
  }

  /** Clear a notification on its forge: done where the forge has "done", otherwise read. */
  async function finish(item: InboxItem): Promise<void> {
    const forge = forges.value.for(item.notification)
    if (!forge) return
    const clear = forge.can('notifications.markDone')
      ? forge.notifications.markDone(item.notification, { thread: item.thread })
      : forge.notifications.markRead(item.notification)
    await clear.catch(() => {})
  }

  /** Mark a single notification thread as read and drop it from the inbox. */
  async function markRead(item: InboxItem): Promise<void> {
    removeItem(item)
    rememberDismissed([item])
    invalidate(`inbox:${item.provider}:${did.value ?? 'anon'}`)
    await finish(item)
  }

  /** Mark many threads read at once (bounded fan-out), e.g. "mark all as read". */
  async function markManyRead(list: InboxItem[]): Promise<void> {
    const targets = list.slice()
    for (const it of targets) removeItem(it)
    rememberDismissed(targets)
    for (const p of new Set(targets.map((t) => t.provider)))
      invalidate(`inbox:${p}:${did.value ?? 'anon'}`)
    await Promise.all(targets.map(finish))
  }

  /** Complete an entire failing-CI group (every collapsed check) at once. */
  async function completeCiGroup(group: CiFailureGroup): Promise<void> {
    await markManyRead(group.items)
  }

  async function reply(item: InboxItem, body: string): Promise<boolean> {
    const forge = item.thread
      ? providerFor({
          forge: item.thread.forge,
          instance: item.thread.instance,
          name: item.repo?.name,
          owner: item.repo?.owner
        })
      : undefined
    if (!forge || !item.thread || !item.repo || !body.trim()) return false
    try {
      await forge.threads.createComment(item.thread, body)
      toast.add({ title: 'Reply posted', color: 'success', icon: 'i-lucide-check' })
      return true
    } catch (e) {
      const hint = describeForgeError(e, {
        provider: item.provider,
        owner: item.repo.owner,
        name: item.repo.name
      })
      toast.add({
        title: 'Could not post reply',
        description: hint.description,
        color: 'error',
        icon: 'i-lucide-circle-alert',
        actions: hint.to ? [{ label: hint.linkLabel, to: hint.to, target: '_blank' }] : undefined
      })
      return false
    }
  }

  return {
    items,
    inboxItems,
    resolvedItems,
    ciGroups,
    ciCount,
    loading,
    notes,
    unreadCount,
    resolvedCount,
    hasSources,
    loadedOnce,
    load,
    reply,
    markRead,
    markManyRead,
    completeCiGroup
  }
}
