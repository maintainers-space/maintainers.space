// "What should I do next": the viewer's open pull requests, review requests and assigned issues,
// pooled across forges.
import type { ForgeProvider, Thread, ThreadSearchQuery } from 'forges'

import { getViewer } from '~/lib/forges/gaps/viewer'
import { forgeIdOf } from '~/lib/forges/registry'
import { repoFullName, threadNumberOf, threadPathOf, threadRouteId } from '~/utils/forge-model'

export interface WorkItem {
  id: string
  isPull: boolean
  number: string
  provider: string
  repo: { fullName: string; name: string; owner: string }
  title: string
  to: string
  updatedAt?: string
}

export interface MyWork {
  assignedIssues: WorkItem[]
  authoredPulls: WorkItem[]
  reviewRequests: WorkItem[]
}

const PER_PAGE = 30

export function toWorkItem(thread: Thread): WorkItem {
  const { repo } = thread.ref
  return {
    id: threadRouteId(thread.ref),
    isPull: thread.kind === 'pull_request',
    number: threadNumberOf(thread.ref),
    provider: forgeIdOf(thread.ref),
    repo: { fullName: repoFullName(repo), name: repo.name, owner: repo.owner },
    title: thread.title,
    to: threadPathOf(thread.ref),
    updatedAt: (thread.updatedAt ?? thread.createdAt)?.toISOString()
  }
}

export function canListMyWork(provider: ForgeProvider): boolean {
  return provider.can('search.threads')
}

export async function loadMyWork(provider: ForgeProvider): Promise<MyWork> {
  const { login } = await getViewer(provider)
  const search = async (query: ThreadSearchQuery) =>
    (
      await provider.search
        .threads({
          direction: 'desc',
          perPage: PER_PAGE,
          sort: 'updated',
          state: 'open',
          ...query
        })
        .page()
    ).items.map(toWorkItem)

  const [authoredPulls, assignedIssues, reviewRequests] = await Promise.all([
    search({ author: login, kind: 'pull_request' }),
    search({ assignee: login, kind: 'issue' }),
    // GAP(forges): `ThreadSearchQuery` cannot ask for review requests. GitHub takes its qualifier in `text`.
    provider.forge === 'github'
      ? search({ kind: 'pull_request', text: `review-requested:${login}` })
      : Promise.resolve([])
  ])
  return { assignedIssues, authoredPulls, reviewRequests }
}
