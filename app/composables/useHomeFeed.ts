import { getForge } from '~/lib/forges'
import type { ForgeIssue } from '~/types/forge'

/**
 * Actionable "what should I work on next" feed for the signed-in home page.
 * Loaded once (no infinite scroll) from GitHub search using the `@me` qualifier
 * so it works purely from the OAuth token — no need to know the login.
 */
export function useHomeFeed() {
  const { get: getToken } = useForgeTokens()

  const myPulls = ref<ForgeIssue[]>([])
  const reviewRequests = ref<ForgeIssue[]>([])
  const assignedIssues = ref<ForgeIssue[]>([])
  const loading = ref(false)
  const loaded = ref(false)

  const ghConnected = computed(() => !!getToken('github'))

  async function load(): Promise<void> {
    const token = getToken('github')
    if (!token) {
      loaded.value = true
      return
    }
    const gh = getForge('github')
    if (!gh?.searchIssues) {
      loaded.value = true
      return
    }
    loading.value = true
    const run = (q: string): Promise<ForgeIssue[]> =>
      gh.searchIssues!(q, { token, sort: 'updated', order: 'desc', limit: 8 })
        .then(r => r.items)
        .catch(() => [] as ForgeIssue[])

    try {
      const [pulls, reviews, issues] = await Promise.all([
        run('is:open is:pr author:@me archived:false'),
        run('is:open is:pr review-requested:@me archived:false'),
        run('is:open is:issue assignee:@me archived:false')
      ])
      myPulls.value = pulls
      reviewRequests.value = reviews
      assignedIssues.value = issues
    } finally {
      loading.value = false
      loaded.value = true
    }
  }

  return { myPulls, reviewRequests, assignedIssues, loading, loaded, ghConnected, load }
}
