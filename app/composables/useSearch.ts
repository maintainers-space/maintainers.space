import { getForge, isForgeId } from '~/lib/forges'
import { parseQuery, type ParsedQuery, type ResultType } from '~/lib/search/parser'
import { astToGitHubQuery } from '~/lib/search/adapters/github'
import { astToTangledPlan, tangledMatches } from '~/lib/search/adapters/tangled'
import type { ForgeId, ForgeDiscussion, ForgeIssue, ForgeRepo, ForgeSearchCode, ForgeSearchOptions, ForgeUser } from '~/types/forge'

export interface SearchResults {
  repos: ForgeRepo[]
  issues: ForgeIssue[]
  code: ForgeSearchCode[]
  users: ForgeUser[]
  discussions: ForgeDiscussion[]
}

const DEFAULT_PROVIDERS: ForgeId[] = ['github', 'tangled']
const DEFAULT_TYPES: ResultType[] = ['repos', 'issues', 'users']

function sortOption(parsed: ParsedQuery): ForgeSearchOptions['sort'] {
  switch (parsed.sortKey) {
    case 'stars': return 'stars'
    case 'forks': return 'forks'
    case 'updated': case 'pushed': return 'updated'
    case 'created': return 'created'
    default: return undefined
  }
}

export function useSearch() {
  const { get: getToken } = useForgeTokens()

  const results = reactive<SearchResults>({ repos: [], issues: [], code: [], users: [], discussions: [] })
  const totals = ref<Partial<Record<ResultType, number>>>({})
  const loading = ref(false)
  const error = ref<string | null>(null)
  const notes = ref<string[]>([])
  const parsed = ref<ParsedQuery>(parseQuery(''))
  const activeProviders = ref<ForgeId[]>([])
  const activeTypes = ref<ResultType[]>([])

  let runToken = 0

  function reset(): void {
    results.repos = []
    results.issues = []
    results.code = []
    results.users = []
    results.discussions = []
    totals.value = {}
    notes.value = []
    error.value = null
  }

  async function run(raw: string, opts?: { limit?: number }): Promise<void> {
    const q = parseQuery(raw)
    parsed.value = q
    reset()
    if (!raw.trim()) return

    const myToken = ++runToken
    loading.value = true

    const providers = (q.providers.length ? q.providers : DEFAULT_PROVIDERS).filter(isForgeId)
    const hasGithubToken = !!getToken('github')
    const defaultTypes: ResultType[] = hasGithubToken ? [...DEFAULT_TYPES, 'discussions'] : DEFAULT_TYPES
    const types = q.resultTypes.length ? q.resultTypes : defaultTypes
    activeProviders.value = providers
    activeTypes.value = types
    const limit = opts?.limit ?? 20
    const noteSet = new Set<string>()

    const gh = astToGitHubQuery(q.root)
    const tangledPlan = astToTangledPlan(q.root)
    const tasks: Promise<void>[] = []

    for (const pid of providers) {
      const forge = getForge(pid)
      if (!forge) continue

      if (pid === 'github') {
        if (gh.dropped.length) noteSet.add(`GitHub ignored unsupported qualifier${gh.dropped.length > 1 ? 's' : ''}: ${gh.dropped.map(d => d + ':').join(', ')}`)
        const ghQuery = gh.query.trim()
        if (!ghQuery) continue
        const base: ForgeSearchOptions = { limit, token: getToken('github'), sort: sortOption(q), order: q.sortOrder }

        if (types.includes('repos') && forge.searchRepos) {
          tasks.push(forge.searchRepos(ghQuery, base).then((r) => {
            if (myToken !== runToken) return
            results.repos.push(...r.items)
            if (r.total != null) totals.value = { ...totals.value, repos: (totals.value.repos ?? 0) + r.total }
          }).catch(() => { noteSet.add('GitHub repository search failed or was rate-limited.') }))
        }
        if (types.includes('issues') && forge.searchIssues) {
          tasks.push(forge.searchIssues(ghQuery, base).then((r) => {
            if (myToken !== runToken) return
            results.issues.push(...r.items)
            if (r.total != null) totals.value = { ...totals.value, issues: (totals.value.issues ?? 0) + r.total }
          }).catch(() => { noteSet.add('GitHub issue search failed or was rate-limited.') }))
        }
        if (types.includes('users') && forge.searchUsers) {
          tasks.push(forge.searchUsers(ghQuery, base).then((r) => {
            if (myToken !== runToken) return
            results.users.push(...r.items)
            if (r.total != null) totals.value = { ...totals.value, users: (totals.value.users ?? 0) + r.total }
          }).catch(() => { /* user search is best-effort */ }))
        }
        if (types.includes('code') && forge.searchCode) {
          if (!base.token) noteSet.add('Add a GitHub token in Settings → Access tokens to enable code search.')
          else tasks.push(forge.searchCode(ghQuery, base).then((r) => {
            if (myToken !== runToken) return
            results.code.push(...r.items)
            if (r.total != null) totals.value = { ...totals.value, code: (totals.value.code ?? 0) + r.total }
          }).catch(() => { noteSet.add('GitHub code search failed.') }))
        }
        if (types.includes('discussions') && forge.searchDiscussions) {
          if (!base.token) {
            if (q.resultTypes.includes('discussions')) noteSet.add('Add a GitHub token in Settings → Access tokens to search Discussions.')
          } else {
            tasks.push(forge.searchDiscussions(ghQuery, base).then((r) => {
              if (myToken !== runToken) return
              results.discussions.push(...r.items)
              if (r.total != null) totals.value = { ...totals.value, discussions: (totals.value.discussions ?? 0) + r.total }
            }).catch(() => { noteSet.add('GitHub discussion search failed.') }))
          }
        }
      }

      if (pid === 'tangled') {
        if (!tangledPlan.usable) {
          if (q.providers.includes('tangled')) noteSet.add('Tangled search needs an owner — add owner:<handle> (e.g. owner:tangled.org).')
          continue
        }
        const owner = tangledPlan.owner!
        if (types.includes('repos') && forge.listRepos) {
          tasks.push(forge.listRepos(owner).then((repos) => {
            if (myToken !== runToken) return
            const matched = repos.filter(r => tangledMatches(tangledPlan, r.name, r.description, r.fullName))
            results.repos.push(...matched.slice(0, limit))
          }).catch(() => { noteSet.add(`Could not list Tangled repos for ${owner}.`) }))
        }
        if (types.includes('issues') && tangledPlan.repoName && forge.listIssues) {
          const locator = { owner, name: tangledPlan.repoName }
          tasks.push(forge.listIssues(locator, { limit: 50 }).then((r) => {
            if (myToken !== runToken) return
            const matched = r.items.filter(it => tangledMatches(tangledPlan, it.title, it.body))
            results.issues.push(...matched.slice(0, limit).map(it => ({
              ...it,
              repo: { provider: 'tangled' as ForgeId, owner, name: tangledPlan.repoName!, fullName: `${owner}/${tangledPlan.repoName}` }
            })))
          }).catch(() => { /* best-effort */ }))
        }
      }
    }

    try {
      await Promise.all(tasks)
    } finally {
      if (myToken === runToken) {
        notes.value = [...noteSet]
        loading.value = false
      }
    }
  }

  const isEmpty = computed(() =>
    !loading.value && !results.repos.length && !results.issues.length && !results.code.length && !results.users.length && !results.discussions.length
  )

  return { results, totals, loading, error, notes, parsed, activeProviders, activeTypes, isEmpty, run }
}
