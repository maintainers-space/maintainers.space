import { forgeList, getForge } from '~/lib/forges'
import type { ForgeInboxItem, ForgeNotification } from '~/types/forge'

/** A repo whose CI is failing repeatedly, collapsed from many check notifications. */
export interface CiFailureGroup {
  key: string
  repo: { owner: string, name: string, fullName: string }
  count: number
  latestAt?: string | null
  to?: string | null
  url?: string | null
  items: ForgeInboxItem[]
}

/** Extract a human message from an ofetch-style error without leaking `any`. */
function errMessage(e: unknown): string | undefined {
  const x = e as { data?: { message?: string }, message?: string } | null | undefined
  return x?.data?.message ?? x?.message
}

/** Wrap a plain notification (forges without an enriched inbox) as an inbox item. */
function toInbox(n: ForgeNotification): ForgeInboxItem {
  return {
    provider: n.provider,
    id: n.id,
    kind: n.kind,
    title: n.title,
    reason: n.reason,
    unread: n.unread,
    updatedAt: n.updatedAt,
    repo: n.repo,
    to: n.to,
    url: n.url
  }
}

/**
 * Bundled, actionable notification inbox across every forge. GitHub items are
 * enriched (state, author, diff stat, unread comments), already-resolved pings
 * are dropped, and dependency-bot PRs are split out so they can be batch-merged.
 * State is shared (useState) so the index and group routes stay in sync.
 */
export function useNotifications() {
  const { get: getToken } = useForgeTokens()
  const { did } = useAuth()
  const toast = useToast()

  const items = useState<ForgeInboxItem[]>('inbox-items', () => [])
  const loading = useState<boolean>('inbox-loading', () => false)
  const notes = useState<string[]>('inbox-notes', () => [])
  const loadedOnce = useState<boolean>('inbox-loaded', () => false)
  const merging = useState<string[]>('inbox-merging', () => [])

  const resolvedItems = computed(() => items.value.filter(i => i.resolved))
  const dependencyItems = computed(() => items.value.filter(i => i.isBot && !i.resolved))
  const ciItems = computed(() => items.value.filter(i => i.kind === 'ci' && !i.isBot && !i.resolved))
  const inboxItems = computed(() =>
    items.value
      .filter(i => !i.resolved && !i.isBot && i.kind !== 'ci')
      // Unread threads first, then most-recently updated (stable sort keeps recency).
      .sort((a, b) => Number(b.unread) - Number(a.unread))
  )
  const unreadCount = computed(() => inboxItems.value.filter(i => i.unread).length)
  const dependencyCount = computed(() => dependencyItems.value.length)
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
        if ((it.updatedAt ?? '') > (g.latestAt ?? '')) g.latestAt = it.updatedAt
      } else {
        map.set(key, { key, repo: it.repo, count: 1, latestAt: it.updatedAt, to: it.to, url: it.url, items: [it] })
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count || (b.latestAt ?? '').localeCompare(a.latestAt ?? ''))
  })
  const ciCount = computed(() => ciItems.value.length)

  const hasSources = computed(() => !!getToken('github') || !!did.value)

  async function load(): Promise<void> {
    loading.value = true
    const noteSet = new Set<string>()
    const collected: ForgeInboxItem[] = []
    const viewer = did.value ?? undefined

    await Promise.all(
      forgeList.map(async (forge) => {
        const token = getToken(forge.id)
        if (forge.id === 'github' && !token) {
          if (viewer) noteSet.add('Connect your GitHub account to include GitHub notifications.')
          return
        }
        try {
          if (forge.listInbox) {
            collected.push(...await forge.listInbox({ token, viewer, limit: 50 }))
          } else if (forge.listNotifications) {
            const ns = await forge.listNotifications({ token, viewer, limit: 50 })
            collected.push(...ns.map(toInbox))
          }
        } catch {
          noteSet.add(`Could not load ${forge.label} notifications.`)
        }
      })
    )

    collected.sort((a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime())
    items.value = collected
    notes.value = [...noteSet]
    loading.value = false
    loadedOnce.value = true
  }

  function removeItem(item: ForgeInboxItem): void {
    items.value = items.value.filter(i => !(i.provider === item.provider && i.id === item.id))
  }

  const isMerging = (item: ForgeInboxItem): boolean => merging.value.includes(`${item.provider}:${item.id}`)

  /** Mark a single notification thread as read and drop it from the inbox. */
  async function markRead(item: ForgeInboxItem): Promise<void> {
    const forge = getForge(item.provider)
    const token = getToken(item.provider)
    removeItem(item)
    if (forge?.markNotificationRead) await forge.markNotificationRead(item.id, { token }).catch(() => {})
  }

  /** Mark many threads read at once (bounded fan-out), e.g. "mark all as read". */
  async function markManyRead(list: ForgeInboxItem[]): Promise<void> {
    const targets = list.slice()
    for (const it of targets) removeItem(it)
    await Promise.all(targets.map((it) => {
      const forge = getForge(it.provider)
      const token = getToken(it.provider)
      return forge?.markNotificationRead ? forge.markNotificationRead(it.id, { token }).catch(() => {}) : Promise.resolve()
    }))
  }

  async function reply(item: ForgeInboxItem, body: string): Promise<boolean> {
    const forge = getForge(item.provider)
    const token = getToken(item.provider)
    if (!forge?.createComment || !item.repo || !item.number || !body.trim()) return false
    try {
      await forge.createComment({ owner: item.repo.owner, name: item.repo.name }, String(item.number), body, { token })
      toast.add({ title: 'Reply posted', color: 'success', icon: 'i-lucide-check' })
      return true
    } catch (e) {
      toast.add({ title: 'Could not post reply', description: errMessage(e), color: 'error', icon: 'i-lucide-circle-alert' })
      return false
    }
  }

  async function approveAndMerge(item: ForgeInboxItem): Promise<boolean> {
    const forge = getForge(item.provider)
    const token = getToken(item.provider)
    if (!forge?.createReview || !forge.mergePull || !item.repo || !item.number) return false
    const key = `${item.provider}:${item.id}`
    const loc = { owner: item.repo.owner, name: item.repo.name }
    merging.value = [...merging.value, key]
    try {
      await forge.createReview(loc, String(item.number), { event: 'APPROVE' }, { token })
      const res = await forge.mergePull(loc, String(item.number), { token })
      if (!res.merged) throw new Error(res.message || 'Merge was not completed')
      if (forge.markNotificationRead) await forge.markNotificationRead(item.id, { token }).catch(() => {})
      removeItem(item)
      toast.add({ title: `Merged ${item.repo.fullName} #${item.number}`, color: 'success', icon: 'i-lucide-git-merge' })
      return true
    } catch (e) {
      toast.add({ title: 'Could not approve & merge', description: errMessage(e), color: 'error', icon: 'i-lucide-circle-alert' })
      return false
    } finally {
      merging.value = merging.value.filter(k => k !== key)
    }
  }

  async function mergeAll(): Promise<void> {
    // Sequential: avoids merge races and API rate spikes when clearing a batch.
    for (const item of dependencyItems.value.slice()) {
      await approveAndMerge(item)
    }
  }

  return {
    items,
    inboxItems,
    dependencyItems,
    resolvedItems,
    ciGroups,
    ciCount,
    loading,
    notes,
    unreadCount,
    dependencyCount,
    resolvedCount,
    hasSources,
    loadedOnce,
    load,
    reply,
    markRead,
    markManyRead,
    approveAndMerge,
    mergeAll,
    isMerging
  }
}
