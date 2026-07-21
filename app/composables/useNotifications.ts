import { forgeList } from '~/lib/forges'
import type { ForgeNotification } from '~/types/forge'

/** Bundled notification inbox across every forge that exposes one. */
export function useNotifications() {
  const { get: getToken } = useForgeTokens()

  const items = ref<ForgeNotification[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const notes = ref<string[]>([])

  const unreadCount = computed(() => items.value.filter(n => n.unread).length)
  const hasTokens = computed(() => forgeList.some(f => f.listNotifications && getToken(f.id)))

  async function load(): Promise<void> {
    loading.value = true
    error.value = null
    const noteSet = new Set<string>()
    const collected: ForgeNotification[] = []

    await Promise.all(
      forgeList.map(async (forge) => {
        if (!forge.listNotifications) return
        const token = getToken(forge.id)
        if (!token) {
          noteSet.add(`Add a ${forge.label} token in Settings to see ${forge.label} notifications.`)
          return
        }
        try {
          const res = await forge.listNotifications({ token, limit: 50 })
          collected.push(...res)
        } catch {
          noteSet.add(`Could not load ${forge.label} notifications.`)
        }
      })
    )

    collected.sort((a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime())
    items.value = collected
    notes.value = [...noteSet]
    loading.value = false
  }

  return { items, loading, error, notes, unreadCount, hasTokens, load }
}
