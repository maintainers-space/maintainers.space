import type { MergeMethod, Repo, Thread } from 'forges'

import { cached, TTL } from '~/lib/cache'
import {
  groupDependencyPrs,
  toDependencyPr,
  type DependencyGroup,
  type DependencyPr
} from '~/lib/dependency-updates'
import { forgeIdOf } from '~/lib/forges/registry'
import { toRepoCard } from '~/lib/forges/view'

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

/** Dependency bumps are noise in history, so squash when the repository allows it. */
const MERGE_PREFERENCE: MergeMethod[] = ['squash', 'merge', 'rebase']

function repoRef(repo: Repo): DependencyPr['repo'] {
  const card = toRepoCard(repo)
  return {
    provider: card.provider,
    owner: card.owner,
    name: card.name,
    fullName: card.fullName,
    url: card.url
  }
}

export interface GroupMergeResult {
  succeeded: DependencyPr[]
  failed: Array<{ item: DependencyPr; error: unknown }>
}

export function useDependencyUpdates() {
  const { tokens } = useForgeTokens()
  const { forges } = useForges()
  const { did } = useAuth()

  const groups = useState<DependencyGroup[]>('dependency-groups', () => [])
  const loading = useState<boolean>('dependency-loading', () => false)
  const loadedOnce = useState<boolean>('dependency-loaded', () => false)
  const notes = useState<string[]>('dependency-notes', () => [])
  const pending = useState<string[]>('dependency-pending', () => [])

  const totalCount = computed(() => groups.value.reduce((n, g) => n + g.items.length, 0))

  function prKey(item: DependencyPr): string {
    return `${item.repo.provider}:${item.repo.fullName}#${threadNumberOf(item.thread.ref)}`
  }

  const isPending = (item: DependencyPr): boolean => pending.value.includes(prKey(item))

  /** Forges with a connected account that can list its repos and pull requests. */
  const activeForges = () =>
    forges.value.providers.filter(
      (f) =>
        f.can('repos.list') && f.can('threads.list', 'pull_request') && !!tokens.value[forgeIdOf(f)]
    )

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
            const id = forgeIdOf(forge)
            try {
              const repos: Repo[] = []
              for await (const repo of forge.repos.list()) repos.push(repo)
              const listed = await mapLimit(repos, 6, async (repo) => {
                try {
                  const pulls: Thread[] = []
                  for await (const pull of forge.threads.list(repo.ref, {
                    kind: 'pull_request',
                    state: 'open'
                  }))
                    pulls.push(pull)
                  return pulls.map((pull) => toDependencyPr(pull, repoRef(repo)))
                } catch {
                  noteSet.add(
                    `Could not load dependency updates from ${toRepoCard(repo).fullName}.`
                  )
                  return [] as DependencyPr[]
                }
              })
              return listed.flat().filter((x): x is DependencyPr => !!x)
            } catch {
              noteSet.add(`Could not load dependency updates from ${id}.`)
              return [] as DependencyPr[]
            }
          })
        )
      ).flat()

    groups.value = groupDependencyPrs(
      await cached(
        `dependencies:${active
          .map((f) => forgeIdOf(f))
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
    const forge = forges.value.for(item.thread.ref)
    if (!forge?.can('threads.approve') || !forge.can('threads.merge'))
      throw new Error(`Cannot merge on forge "${item.repo.provider}".`)

    // Re-read the pull so a stale list can never merge something that moved or closed.
    const fresh = await forge.threads.get(item.thread.ref)
    if (fresh.state !== 'open' || fresh.isDraft)
      throw new Error(`This ${pullsTerm(item.repo.provider)} is no longer open and unlocked.`)

    const { mergeMethods } = await forge.repos.get(fresh.ref.repo)
    await forge.threads.approve(fresh.ref)
    await forge.threads.merge(fresh.ref, {
      method: MERGE_PREFERENCE.find((m) => mergeMethods?.includes(m)),
      sha: fresh.branches?.head.sha
    })
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
      name: item.thread.title,
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
