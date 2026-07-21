import { forgeList } from '~/lib/forges'
import type { ForgeNotification } from '~/types/forge'

/** Bundled notification inbox across every forge that exposes one. */
export function useNotifications() {
  const { get: getToken } = useForgeTokens()
  const { did } = useAuth()

  const items = ref<ForgeNotification[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const notes = ref<string[]>([])

  const unreadCount = computed(() => items.value.filter(n => n.unread).length)
  // We have at least one notification source when GitHub is connected (OAuth
  // token) or the viewer is signed in via atproto (Tangled/other forges).
  const hasSources = computed(() => !!getToken('github') || !!did.value)

  async function load(): Promise<void> {
    loading.value = true
    error.value = null
    const noteSet = new Set<string>()
    const collected: ForgeNotification[] = []
    const viewer = did.value ?? undefined

    await Promise.all(
      forgeList.map(async (forge) => {
        if (!forge.listNotifications) return
        const token = getToken(forge.id)
        // GitHub needs an OAuth token; nudge the user to connect if missing.
        if (forge.id === 'github' && !token) {
          if (viewer) noteSet.add('Connect your GitHub account to include GitHub notifications.')
          return
        }
        try {
          const res = await forge.listNotifications({ token, viewer, limit: 50 })
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

  return { items, loading, error, notes, unreadCount, hasSources, load }
}
