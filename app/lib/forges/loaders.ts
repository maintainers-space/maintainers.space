// Fetches whose results are cached under well-known keys. Pages and the offline prefetcher both
// call these, so a prefetched page is indistinguishable from one the user opened themselves.
import type { CiRun, Comment, ForgeProvider, Repo, Thread, ThreadKind, ThreadRef } from 'forges'

import type { TangledRepoRaw } from './gaps/tangled'
import { listTangledRuns } from './gaps/tangled'
import { isTangled } from './reads'

export type ListState = 'open' | 'closed' | 'merged'

const PAGE_SIZE = 30

/** First page of a repo's threads. `merged` is a filter over closed pull requests. */
export async function loadThreads(
  provider: ForgeProvider,
  repo: Repo,
  kind: 'issue' | 'pull_request' | 'discussion',
  state: ListState = 'open'
): Promise<Thread[]> {
  const page = await provider.threads
    .list(repo.ref, {
      kind,
      perPage: state === 'merged' ? 100 : PAGE_SIZE,
      state: state === 'open' ? 'open' : 'closed'
    })
    .page()
  if (state === 'merged') return page.items.filter((t) => t.state === 'merged').slice(0, PAGE_SIZE)
  if (state === 'closed') return page.items.filter((t) => t.state !== 'merged')
  return page.items
}

/**
 * The package ref for a route id. Tangled records are addressed by author DID and rkey, but our
 * URLs only carry the rkey, so it is matched against the repo's thread list.
 */
export async function resolveThreadRef(
  provider: ForgeProvider,
  repo: Repo,
  kind: ThreadKind,
  id: string
): Promise<ThreadRef> {
  if (!isTangled(provider) || kind === 'discussion') {
    return { forge: repo.ref.forge, instance: repo.ref.instance, kind, number: id, repo: repo.ref }
  }
  for await (const thread of provider.threads.list(repo.ref, {
    kind: kind as 'issue' | 'pull_request',
    state: 'all'
  })) {
    if (thread.ref.number?.endsWith(`/${id}`)) return thread.ref
  }
  throw createError({ statusCode: 404, statusMessage: `"${id}" was not found in this repository.` })
}

export async function loadThread(
  provider: ForgeProvider,
  repo: Repo,
  kind: ThreadKind,
  id: string
): Promise<Thread> {
  return provider.threads.get(await resolveThreadRef(provider, repo, kind, id))
}

export interface ThreadDetail {
  comments: Comment[]
  thread: Thread
}

/** A thread with its conversation, as the issue, pull and discussion pages show it. */
export async function loadThreadDetail(
  provider: ForgeProvider,
  repo: Repo,
  kind: ThreadKind,
  id: string
): Promise<ThreadDetail> {
  const thread = await loadThread(provider, repo, kind, id)
  const comments: Comment[] = []
  for await (const comment of provider.threads.comments(thread.ref)) comments.push(comment)
  return { comments, thread }
}

/** First page of a repo's CI runs. */
export async function loadRuns(provider: ForgeProvider, repo: Repo): Promise<CiRun[]> {
  if (isTangled(provider)) {
    return listTangledRuns(provider, repo.ref, (repo.raw as TangledRepoRaw).spindle, PAGE_SIZE)
  }
  return (await provider.ci.runs(repo.ref, { perPage: PAGE_SIZE }).page()).items
}
