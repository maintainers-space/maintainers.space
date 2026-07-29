import { getForge, isForgeId, forgeList } from '~/lib/forges'
import { parseQuery, type ParsedQuery, type QueryNode, type ResultType } from '~/lib/search/parser'
import { astToGitHubQuery } from '~/lib/search/adapters/github'
import { astToClientFilterPlan, clientFilterMatches } from '~/lib/search/adapters/generic'
import type {
  ForgeId,
  ForgeDiscussion,
  ForgeIssue,
  ForgeRepo,
  ForgeSearchCode,
  ForgeSearchOptions,
  ForgeUser
} from '~/types/forge'

export interface SearchResults {
  repos: ForgeRepo[]
  issues: ForgeIssue[]
  code: ForgeSearchCode[]
  users: ForgeUser[]
  discussions: ForgeDiscussion[]
}

const DEFAULT_TYPES: ResultType[] = ['repos', 'issues', 'users']

/**
 * Forges with no server-side search API at all: the AST is compiled into a
 * scope (owner/workspace) plus a client-side term filter over listRepos/listIssues
 * instead of a real query. Keyed by which qualifiers resolve the scope.
 */
const CLIENT_FILTER_SCOPES: Partial<Record<ForgeId, string[]>> = {
  tangled: ['owner', 'user', 'org', 'handle', 'from', 'author'],
  sourcehut: ['owner', 'user', 'handle', 'from', 'author'],
  bitbucket: ['workspace', 'ws', 'owner']
}

/** Qualifier-rich AST -> native query string, for forges with a search DSL beyond plain text. */
const QUERY_ADAPTERS: Partial<
  Record<ForgeId, (root: QueryNode | null) => { query: string; dropped: string[] }>
> = {
  github: astToGitHubQuery
}

/** Flatten an AST to its free-text terms — most forges' search takes plain text. */
function astToPlainText(node: QueryNode | null): string {
  if (!node) return ''
  switch (node.type) {
    case 'term':
      return node.value
    case 'qualifier':
      return ''
    case 'not':
      return ''
    case 'and':
    case 'or':
      return node.nodes.map(astToPlainText).filter(Boolean).join(' ')
  }
}

function sortOption(parsed: ParsedQuery): ForgeSearchOptions['sort'] {
  switch (parsed.sortKey) {
    case 'stars':
      return 'stars'
    case 'forks':
      return 'forks'
    case 'updated':
    case 'pushed':
      return 'updated'
    case 'created':
      return 'created'
    default:
      return undefined
  }
}

// --- Cross-provider relevance ranking ---------------------------------------
// Pooled results have no shared relevance signal from the providers themselves
// (each just returns "matched, in whatever order"), so score locally: text-match
// quality against the query's free-text terms, plus a light provider-agnostic
// popularity/recency signal, so a mixed-provider group reads as one ranked list
// instead of "whichever provider's promise resolved first."

function textScore(query: string, ...fields: Array<string | null | undefined>): number {
  const q = query.trim().toLowerCase()
  if (!q) return 0
  let best = 0
  fields.forEach((f, i) => {
    if (!f) return
    const hay = f.toLowerCase()
    const weight = i === 0 ? 3 : 1
    let s = 0
    if (hay === q) s = 30
    else if (hay.startsWith(q)) s = 20
    else if (hay.includes(q)) s = 10
    best = Math.max(best, s * weight)
  })
  return best
}

function rankRepos(list: ForgeRepo[], terms: string): ForgeRepo[] {
  return list
    .map((r) => ({
      r,
      score: textScore(terms, r.name, r.description) + Math.log10((r.stars ?? 0) + 1) * 5
    }))
    .sort(
      (a, b) =>
        b.score - a.score || String(b.r.updatedAt ?? '').localeCompare(String(a.r.updatedAt ?? ''))
    )
    .map((x) => x.r)
}

function rankIssues(list: ForgeIssue[], terms: string): ForgeIssue[] {
  return list
    .map((it) => ({
      it,
      score: textScore(terms, it.title, it.body) + (it.state === 'open' ? 5 : 0)
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        String(b.it.updatedAt ?? '').localeCompare(String(a.it.updatedAt ?? ''))
    )
    .map((x) => x.it)
}

function rankDiscussions(list: ForgeDiscussion[], terms: string): ForgeDiscussion[] {
  return list
    .map((d) => ({ d, score: textScore(terms, d.title, d.body) }))
    .sort(
      (a, b) =>
        b.score - a.score || String(b.d.createdAt ?? '').localeCompare(String(a.d.createdAt ?? ''))
    )
    .map((x) => x.d)
}

function rankUsers(list: ForgeUser[], terms: string): ForgeUser[] {
  return list
    .map((u) => ({ u, score: textScore(terms, u.login, u.displayName) }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.u)
}

function rankCode(list: ForgeSearchCode[], terms: string): ForgeSearchCode[] {
  return list
    .map((c) => ({ c, score: textScore(terms, c.path) }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.c)
}

export function useSearch() {
  const { get: getToken } = useForgeTokens()

  const results = reactive<SearchResults>({
    repos: [],
    issues: [],
    code: [],
    users: [],
    discussions: []
  })
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

  async function run(raw: string, opts?: { limit?: number; noCache?: boolean }): Promise<void> {
    const q = parseQuery(raw)
    parsed.value = q
    reset()
    if (!raw.trim()) return

    const myToken = ++runToken
    loading.value = true

    const providers = (q.providers.length ? q.providers : forgeList.map((f) => f.id)).filter(
      isForgeId
    )
    const hasGithubToken = !!getToken('github')
    const defaultTypes: ResultType[] = hasGithubToken
      ? [...DEFAULT_TYPES, 'discussions']
      : DEFAULT_TYPES
    const types = q.resultTypes.length ? q.resultTypes : defaultTypes
    activeProviders.value = providers
    activeTypes.value = types
    const limit = opts?.limit ?? 20
    const noteSet = new Set<string>()

    const plainText = astToPlainText(q.root).trim()
    const tasks: Promise<void>[] = []

    for (const pid of providers) {
      const forge = getForge(pid)
      if (!forge) continue

      const scopeKeys = CLIENT_FILTER_SCOPES[pid]
      if (scopeKeys) {
        // No server-side search: list + match locally, scoped to an owner/workspace.
        const plan = astToClientFilterPlan(q.root, { ownerKeys: scopeKeys })
        if (!plan.usable) {
          if (q.providers.includes(pid)) {
            noteSet.add(`${forge.label} search needs a scope — add ${scopeKeys[0]}:<name>.`)
          }
          continue
        }
        const owner = plan.owner!
        const token = getToken(pid)
        if (types.includes('repos') && forge.listRepos) {
          tasks.push(
            forge
              .listRepos(owner, { token })
              .then((repos) => {
                if (myToken !== runToken) return
                const matched = repos.filter((r) =>
                  clientFilterMatches(plan, r.name, r.description, r.fullName)
                )
                results.repos.push(...matched.slice(0, limit))
              })
              .catch(() => {
                noteSet.add(`Could not list ${forge.label} repositories for ${owner}.`)
              })
          )
        }
        if (types.includes('issues') && plan.repoName && forge.listIssues) {
          const locator = { owner, name: plan.repoName }
          tasks.push(
            forge
              .listIssues(locator, { token, limit: 50 })
              .then((r) => {
                if (myToken !== runToken) return
                const matched = r.items.filter((it) => clientFilterMatches(plan, it.title, it.body))
                results.issues.push(
                  ...matched.slice(0, limit).map((it) => ({
                    ...it,
                    repo: {
                      provider: pid,
                      owner,
                      name: plan.repoName!,
                      fullName: `${owner}/${plan.repoName}`
                    }
                  }))
                )
              })
              .catch(() => {
                /* best-effort */
              })
          )
        }
        continue
      }

      // Server-side search: resolve a query string (native adapter or plain text),
      // then attempt every result type the forge supports.
      const adapter = QUERY_ADAPTERS[pid]
      let queryText: string
      if (adapter) {
        const res = adapter(q.root)
        if (res.dropped.length) {
          noteSet.add(
            `${forge.label} ignored unsupported qualifier${res.dropped.length > 1 ? 's' : ''}: ${res.dropped.map((d) => d + ':').join(', ')}`
          )
        }
        queryText = res.query.trim()
      } else {
        queryText = plainText
      }
      if (!queryText) continue

      const base: ForgeSearchOptions = {
        limit,
        token: getToken(pid),
        sort: sortOption(q),
        order: q.sortOrder,
        noCache: opts?.noCache
      }

      if (types.includes('repos') && forge.searchRepos) {
        tasks.push(
          forge
            .searchRepos(queryText, base)
            .then((r) => {
              if (myToken !== runToken) return
              results.repos.push(...r.items)
              if (r.total != null)
                totals.value = { ...totals.value, repos: (totals.value.repos ?? 0) + r.total }
            })
            .catch(() => {
              noteSet.add(`${forge.label} repository search failed or was rate-limited.`)
            })
        )
      }
      if (types.includes('issues') && forge.searchIssues) {
        tasks.push(
          forge
            .searchIssues(queryText, base)
            .then((r) => {
              if (myToken !== runToken) return
              results.issues.push(...r.items)
              if (r.total != null)
                totals.value = { ...totals.value, issues: (totals.value.issues ?? 0) + r.total }
            })
            .catch(() => {
              noteSet.add(`${forge.label} issue search failed or was rate-limited.`)
            })
        )
      }
      if (types.includes('users') && forge.searchUsers) {
        tasks.push(
          forge
            .searchUsers(queryText, base)
            .then((r) => {
              if (myToken !== runToken) return
              results.users.push(...r.items)
              if (r.total != null)
                totals.value = { ...totals.value, users: (totals.value.users ?? 0) + r.total }
            })
            .catch(() => {
              noteSet.add(`${forge.label} people search failed or was rate-limited.`)
            })
        )
      }
      if (types.includes('code') && forge.searchCode) {
        if (!base.token) {
          noteSet.add(
            `Add a ${forge.label} token in Settings → Access tokens to enable code search.`
          )
        } else {
          tasks.push(
            forge
              .searchCode(queryText, base)
              .then((r) => {
                if (myToken !== runToken) return
                results.code.push(...r.items)
                if (r.total != null)
                  totals.value = { ...totals.value, code: (totals.value.code ?? 0) + r.total }
              })
              .catch(() => {
                noteSet.add(`${forge.label} code search failed.`)
              })
          )
        }
      }
      if (types.includes('discussions') && forge.searchDiscussions) {
        if (!base.token) {
          noteSet.add(
            `Add a ${forge.label} token in Settings → Access tokens to search Discussions.`
          )
        } else {
          tasks.push(
            forge
              .searchDiscussions(queryText, base)
              .then((r) => {
                if (myToken !== runToken) return
                results.discussions.push(...r.items)
                if (r.total != null)
                  totals.value = {
                    ...totals.value,
                    discussions: (totals.value.discussions ?? 0) + r.total
                  }
              })
              .catch(() => {
                noteSet.add(`${forge.label} discussion search failed.`)
              })
          )
        }
      }
    }

    try {
      await Promise.all(tasks)
    } finally {
      if (myToken === runToken) {
        const terms = plainText
        results.repos = rankRepos(results.repos, terms)
        results.issues = rankIssues(results.issues, terms)
        results.discussions = rankDiscussions(results.discussions, terms)
        results.users = rankUsers(results.users, terms)
        results.code = rankCode(results.code, terms)
        notes.value = [...noteSet]
        loading.value = false
      }
    }
  }

  const isEmpty = computed(
    () =>
      !loading.value &&
      !results.repos.length &&
      !results.issues.length &&
      !results.code.length &&
      !results.users.length &&
      !results.discussions.length
  )

  return {
    results,
    totals,
    loading,
    error,
    notes,
    parsed,
    activeProviders,
    activeTypes,
    isEmpty,
    run
  }
}
