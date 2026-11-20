import type { ForgeProvider, RepoSearchQuery, Thread, ThreadSearchQuery } from 'forges'

import { balanceByDominance } from '~/lib/forge-balance'
import {
  canSearchCode,
  canSearchDiscussions,
  canSearchUsers,
  searchCode,
  searchDiscussions,
  searchUsers
} from '~/lib/forges/gaps/search-extra'
import type { CodeHit, DiscussionHit, UserHit } from '~/lib/forges/gaps/search-extra'
import { listOwnerRepos } from '~/lib/forges/reads'
import { forgeIdOf, forgeList, getForge, isForgeId, repoRefOf } from '~/lib/forges/registry'
import { toRepoCard } from '~/lib/forges/view'
import type { RepoCard } from '~/lib/forges/view'
import { astToGitHubQuery } from '~/lib/search/adapters/github'
import { astToClientFilterPlan, clientFilterMatches } from '~/lib/search/adapters/generic'
import { parseQuery, type ParsedQuery, type QueryNode, type ResultType } from '~/lib/search/parser'

export interface SearchResults {
  repos: RepoCard[]
  issues: Thread[]
  code: CodeHit[]
  users: UserHit[]
  discussions: DiscussionHit[]
}

const DEFAULT_TYPES: ResultType[] = ['repos', 'issues', 'users']

/** Qualifier keys that scope a repository search to one account. */
const OWNER_KEYS = ['owner', 'user', 'org', 'workspace', 'ws', 'handle']

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

/** Top-level `key:value` qualifiers, which map onto the package's structured search fields. */
function collectTopLevelQualifiers(node: QueryNode | null): Map<string, string[]> {
  const out = new Map<string, string[]>()
  const visit = (n: QueryNode | null): void => {
    if (!n) return
    if (n.type === 'qualifier') out.set(n.key, [...(out.get(n.key) ?? []), n.value])
    else if (n.type === 'and') n.nodes.forEach(visit)
  }
  visit(node)
  return out
}

function threadFields(root: QueryNode | null): Partial<ThreadSearchQuery> {
  const q = collectTopLevelQualifiers(root)
  const first = (...keys: string[]) => keys.flatMap((k) => q.get(k) ?? [])[0]
  const is = q.get('is') ?? []
  const state = first('state') ?? is.find((v) => ['open', 'closed'].includes(v))
  return {
    assignee: first('assignee'),
    author: first('author'),
    involves: first('involves'),
    kind:
      is.includes('pr') || is.includes('pull')
        ? 'pull_request'
        : is.includes('issue')
          ? 'issue'
          : undefined,
    labels: q.get('label'),
    state: state === 'open' || state === 'closed' ? state : undefined
  }
}

function repoFields(root: QueryNode | null): Partial<RepoSearchQuery> {
  const q = collectTopLevelQualifiers(root)
  return {
    language: (q.get('language') ?? q.get('lang') ?? [])[0],
    owner: OWNER_KEYS.flatMap((k) => q.get(k) ?? [])[0]
  }
}

function repoSort(parsed: ParsedQuery): RepoSearchQuery['sort'] {
  switch (parsed.sortKey) {
    case 'stars':
      return 'stars'
    case 'updated':
      return 'updated'
    case 'created':
      return 'created'
    default:
      return undefined
  }
}

function threadSort(parsed: ParsedQuery): ThreadSearchQuery['sort'] {
  switch (parsed.sortKey) {
    case 'updated':
      return 'updated'
    case 'created':
      return 'created'
    case 'comments':
      return 'comments'
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

function rankRepos(list: RepoCard[], terms: string): RepoCard[] {
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

function rankIssues(list: Thread[], terms: string): Thread[] {
  return list
    .map((it) => ({
      it,
      score: textScore(terms, it.title, it.body) + (it.state === 'open' ? 5 : 0)
    }))
    .sort(
      (a, b) =>
        b.score - a.score || (b.it.updatedAt?.getTime() ?? 0) - (a.it.updatedAt?.getTime() ?? 0)
    )
    .map((x) => x.it)
}

function rankDiscussions(list: DiscussionHit[], terms: string): DiscussionHit[] {
  return list
    .map((d) => ({ d, score: textScore(terms, d.title) }))
    .sort(
      (a, b) =>
        b.score - a.score || String(b.d.createdAt ?? '').localeCompare(String(a.d.createdAt ?? ''))
    )
    .map((x) => x.d)
}

function rankUsers(list: UserHit[], terms: string): UserHit[] {
  return list
    .map((u) => ({ u, score: textScore(terms, u.login, u.name) }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.u)
}

function rankCode(list: CodeHit[], terms: string): CodeHit[] {
  return list
    .map((c) => ({ c, score: textScore(terms, c.path) }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.c)
}

export function useSearch() {
  const { providerFor } = useForges()

  const results = reactive<SearchResults>({
    repos: [],
    issues: [],
    code: [],
    users: [],
    discussions: []
  })
  const loading = ref(false)
  const error = ref<string | null>(null)
  const notes = ref<string[]>([])
  const parsed = ref<ParsedQuery>(parseQuery(''))
  const activeProviders = ref<string[]>([])
  const activeTypes = ref<ResultType[]>([])
  // The package returns no result totals, so only what was fetched is counted.
  const totals = computed<Partial<Record<ResultType, number>>>(() => ({}))

  let runToken = 0

  function reset(): void {
    results.repos = []
    results.issues = []
    results.code = []
    results.users = []
    results.discussions = []
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

    const providers = (q.providers.length ? q.providers : forgeList.map((f) => f.id)).filter(
      isForgeId
    )
    const defaultTypes: ResultType[] = [...DEFAULT_TYPES, 'discussions']
    const types = q.resultTypes.length ? q.resultTypes : defaultTypes
    activeProviders.value = providers
    activeTypes.value = types
    const perPage = opts?.limit ?? 20
    const noteSet = new Set<string>()
    const plainText = astToPlainText(q.root).trim()
    const tasks: Promise<void>[] = []

    const guard = (work: () => Promise<void>, failure: string): void => {
      tasks.push(
        work().catch(() => {
          noteSet.add(failure)
        })
      )
    }

    for (const pid of providers) {
      const descriptor = getForge(pid)
      const ref = repoRefOf(pid, '', '')
      const forge: ForgeProvider | undefined = ref ? providerFor(ref) : undefined
      if (!descriptor || !forge) continue
      const label = descriptor.label

      // Forges without a search API (Tangled) are searched by listing one owner and matching locally.
      if (!forge.can('search.repos') && !forge.can('search.threads')) {
        const plan = astToClientFilterPlan(q.root, { ownerKeys: OWNER_KEYS })
        if (!plan.usable) {
          if (q.providers.includes(pid)) {
            noteSet.add(`${label} search needs a scope — add owner:<name>.`)
          }
          continue
        }
        if (types.includes('repos')) {
          guard(async () => {
            const repos = (await listOwnerRepos(forge, plan.owner!)).map(toRepoCard)
            if (myToken !== runToken) return
            results.repos.push(
              ...repos
                .filter((r) => clientFilterMatches(plan, r.name, r.description, r.fullName))
                .slice(0, perPage)
            )
          }, `Could not list ${label} repositories for ${plan.owner}.`)
        }
        continue
      }

      // GitHub takes its qualifier DSL verbatim in `text`; every other forge gets plain text
      // plus whichever qualifiers the package can express as structured fields.
      let text = plainText
      if (forge.forge === 'github') {
        const res = astToGitHubQuery(q.root)
        if (res.dropped.length) {
          noteSet.add(
            `${label} ignored unsupported qualifier${res.dropped.length > 1 ? 's' : ''}: ${res.dropped.map((d) => d + ':').join(', ')}`
          )
        }
        text = res.query.trim()
      }
      if (!text) continue

      if (types.includes('repos') && forge.can('search.repos')) {
        guard(async () => {
          const page = await forge.search
            .repos({
              direction: q.sortOrder,
              perPage,
              sort: repoSort(q),
              text,
              ...(forge.forge === 'github' ? {} : repoFields(q.root))
            })
            .page()
          if (myToken === runToken) results.repos.push(...page.items.map(toRepoCard))
        }, `${label} repository search failed or was rate-limited.`)
      }
      if (types.includes('issues') && forge.can('search.threads')) {
        guard(async () => {
          const page = await forge.search
            .threads({
              direction: q.sortOrder,
              perPage,
              sort: threadSort(q),
              text,
              ...(forge.forge === 'github' ? {} : threadFields(q.root))
            })
            .page()
          if (myToken === runToken) results.issues.push(...page.items)
        }, `${label} issue search failed or was rate-limited.`)
      }
      if (types.includes('users') && canSearchUsers(forge)) {
        guard(async () => {
          const users = await searchUsers(forge, text, perPage)
          if (myToken === runToken) results.users.push(...users)
        }, `${label} people search failed or was rate-limited.`)
      }
      if (types.includes('code') && forge.forge === 'github') {
        if (!canSearchCode(forge)) {
          noteSet.add(`Add a ${label} token in Settings → Access tokens to enable code search.`)
        } else {
          guard(async () => {
            const hits = await searchCode(forge, text, perPage)
            if (myToken === runToken) results.code.push(...hits)
          }, `${label} code search failed.`)
        }
      }
      if (
        types.includes('discussions') &&
        forge.forge === 'github' &&
        canSearchDiscussions(forge)
      ) {
        guard(async () => {
          const hits = await searchDiscussions(forge, text, perPage)
          if (myToken === runToken) results.discussions.push(...hits)
        }, `${label} discussion search failed.`)
      }
    }

    try {
      await Promise.all(tasks)
    } finally {
      if (myToken === runToken) {
        const terms = plainText
        // Rank within each provider first, then interleave providers by
        // dominance so results read as one fair, forge-agnostic list rather
        // than "GitHub, then everyone else" once relevance ties are broken by
        // GitHub's much larger star counts.
        results.repos = balanceByDominance(rankRepos(results.repos, terms))
        results.issues = balanceByDominance(
          rankIssues(results.issues, terms).map((t) => ({ provider: forgeIdOf(t.ref), thread: t }))
        ).map((x) => x.thread)
        results.discussions = balanceByDominance(rankDiscussions(results.discussions, terms))
        results.users = balanceByDominance(rankUsers(results.users, terms))
        results.code = balanceByDominance(rankCode(results.code, terms))
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
