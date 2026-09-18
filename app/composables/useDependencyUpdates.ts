import { forgeList, getForge } from '~/lib/forges'
import { cached, TTL } from '~/lib/cache'
import {
  groupDependencyPrs,
  toDependencyPr,
  type DependencyGroup,
  type DependencyPr
} from '~/lib/dependency-updates'
import type { ForgePull, ForgeRepo, ForgeReviewInput, RepoLocator } from '~/types/forge'

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

function repoRef(repo: ForgeRepo, provider: string): DependencyPr['repo'] {
  return {
    provider,
    owner: repo.owner,
    name: repo.name,
    fullName: repo.fullName,
    url: repo.url
  }
}

function errorStatus(e: unknown): number | undefined {
  const err = e as { response?: { status?: number }; statusCode?: number; status?: number }
  return err.response?.status ?? err.statusCode ?? err.status
}

function errorMessage(e: unknown): string {
  const err = e as { data?: { message?: string }; message?: string }
  return String(err.data?.message ?? err.message ?? '')
}

function isGitHubSelfApprovalRejection(e: unknown): boolean {
  if (errorStatus(e) !== 422) return false
  const errors = (e as { data?: { errors?: { message?: string }[] } }).data?.errors ?? []
  const any = `${errorMessage(e)} ${errors.map((er) => er.message ?? '').join(' ')}`
  return /approve a pull request (authored|created) by/i.test(any)
}

export interface GroupMergeResult {
  succeeded: DependencyPr[]
  failed: Array<{ item: DependencyPr; error: unknown }>
}

export function useDependencyUpdates() {
  const { get: getToken } = useForgeTokens()
  const { did } = useAuth()

  const groups = useState<DependencyGroup[]>('dependency-groups', () => [])
  const loading = useState<boolean>('dependency-loading', () => false)
  const loadedOnce = useState<boolean>('dependency-loaded', () => false)
  const notes = useState<string[]>('dependency-notes', () => [])
  const pending = useState<string[]>('dependency-pending', () => [])

  const totalCount = computed(() => groups.value.reduce((n, g) => n + g.items.length, 0))

  function prKey(item: DependencyPr): string {
    return `${item.repo.provider}:${item.repo.fullName}#${item.pull.number ?? item.pull.id}`
  }

  const isPending = (item: DependencyPr): boolean => pending.value.includes(prKey(item))

  const activeForges = () =>
    forgeList.filter((f) => f.listAccessibleRepos && f.listPulls && !!getToken(f.id))

  async function load(force = false): Promise<void> {
    loading.value = true
    const noteSet = new Set<string>()
    const viewer = did.value ?? undefined
    const active = activeForges()
    if (viewer && !active.length)
      noteSet.add('Connect a GitHub, GitLab or Gitea account to aggregate dependency updates.')

    const fetcher = async (): Promise<DependencyPr[]> =>
      (
        await Promise.all(
          active.map(async (forge) => {
            const token = getToken(forge.id)
            try {
              const repos = await forge.listAccessibleRepos!({ token, viewer })
              const listed = await mapLimit(repos, 6, async (repo) => {
                try {
                  const pulls: ForgePull[] = []
                  let cursor: string | undefined
                  do {
                    const page = await forge.listPulls!(
                      { owner: repo.owner, name: repo.name, ref: repo.ref },
                      { state: 'open', limit: 50, cursor, token, viewer }
                    )
                    pulls.push(...page.items)
                    cursor = page.cursor
                  } while (cursor)
                  return pulls.map((pull: ForgePull) =>
                    toDependencyPr(pull, repoRef(repo, forge.id))
                  )
                } catch {
                  noteSet.add(`Could not load dependency updates from ${repo.fullName}.`)
                  return [] as DependencyPr[]
                }
              })
              return listed.flat().filter((x): x is DependencyPr => !!x)
            } catch {
              noteSet.add(`Could not load dependency updates from ${forge.label}.`)
              return [] as DependencyPr[]
            }
          })
        )
      ).flat()

    groups.value = groupDependencyPrs(
      await cached(
        `dependencies:${active
          .map((f) => f.id)
          .sort()
          .join(',')}:${viewer ?? 'anon'}`,
        fetcher,
        { ttl: TTL.SHORT, force, onRevalidate: (prs) => (groups.value = groupDependencyPrs(prs)) }
      )
    )
    notes.value = [...noteSet]
    loading.value = false
    loadedOnce.value = true
  }

  async function approveAndMerge(item: DependencyPr): Promise<void> {
    const forge = getForge(item.repo.provider)
    if (!forge?.mergePull) throw new Error(`Cannot merge on forge "${item.repo.provider}".`)
    const token = getToken(item.repo.provider)
    const loc: RepoLocator = { owner: item.repo.owner, name: item.repo.name }
    const number = String(item.pull.number ?? item.pull.id)
    if (!number) throw new Error('This update has no pull request number.')

    let expectedHead: string | undefined
    if (forge.getPull) {
      const fresh = await forge.getPull(loc, number, { token })
      if (fresh.state === 'closed' || fresh.state === 'merged' || fresh.state === 'draft')
        throw new Error(`This ${pullsTerm(forge.id)} is no longer open and unlocked.`)
      expectedHead = fresh.headSha ?? undefined
    }

    const input: ForgeReviewInput = {
      event: 'APPROVE',
      ...(expectedHead ? { expectedHead } : {})
    }
    let approvalError: unknown
    if (forge.createReview) {
      try {
        await forge.createReview(loc, number, input, { token })
      } catch (e) {
        const selfApproval = item.repo.provider === 'github' && isGitHubSelfApprovalRejection(e)
        if (!selfApproval) throw e
        approvalError = e
      }
    }
    const res = await forge.mergePull(loc, number, {
      token,
      ...(expectedHead ? { expectedHead } : {})
    })
    if (!res.merged) {
      const reason = res.message || 'Merge was not completed.'
      if (approvalError)
        throw new Error(`${reason} (approval rejected: ${errorMessage(approvalError)})`)
      throw new Error(reason)
    }
  }

  async function mergeGroup(group: DependencyGroup): Promise<GroupMergeResult> {
    const todos = group.items.filter((item) => !isPending(item))
    const keys = todos.map(prKey)
    pending.value = [...pending.value, ...keys]
    const result: GroupMergeResult = { succeeded: [], failed: [] }
    try {
      for (const item of todos) {
        try {
          await approveAndMerge(item)
          result.succeeded.push(item)
        } catch (e) {
          result.failed.push({ item, error: e })
        } finally {
          pending.value = pending.value.filter((k) => k !== prKey(item))
        }
      }
    } finally {
      pending.value = pending.value.filter((k) => !keys.includes(k))
      await load(true).catch(() => {})
    }
    return result
  }

  function mergeOne(item: DependencyPr): Promise<GroupMergeResult> {
    return mergeGroup({
      key: prKey(item),
      name: item.pull.title,
      items: [item],
      unparsable: true
    })
  }

  return {
    groups,
    totalCount,
    loading,
    loadedOnce,
    notes,
    isPending,
    load,
    mergeGroup,
    mergeOne
  }
}
