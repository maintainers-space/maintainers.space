import type { Actor, CommentRef, RepoRef, Thread, ThreadRef } from 'forges'
import { forgeIdOf } from '~/lib/forges/registry'

const seg = (s: string): string => encodeURIComponent(s)

/** In-app path of a repository, e.g. `/github/vuejs/core/pulls`. */
export function repoPathOf(repo: RepoRef, sub = ''): string {
  const base = `/${forgeIdOf(repo)}/${seg(repo.owner)}/${seg(repo.name)}`
  return sub ? `${base}/${sub.replace(/^\//, '')}` : base
}

/** Last AT-URI segment: Tangled threads are addressed by rkey in our URLs. */
export function threadRouteId(ref: ThreadRef): string {
  const number = ref.number ?? ref.displayNumber ?? ''
  return ref.forge === 'tangled' ? (number.split('/').pop() ?? number) : number
}

/** In-app path of a thread (issue, pull request, discussion). */
export function threadPathOf(ref: ThreadRef): string {
  const section =
    ref.kind === 'pull_request' ? 'pulls' : ref.kind === 'discussion' ? 'discussions' : 'issues'
  return repoPathOf(ref.repo, `${section}/${seg(threadRouteId(ref))}`)
}

/** In-app path of an account page. */
export function actorPathOf(actor: Pick<Actor, 'forge' | 'instance' | 'login'>): string {
  return `/${forgeIdOf(actor)}/${seg(actor.login)}`
}

/** `acme/widgets`, for display. */
export function repoFullName(repo: RepoRef): string {
  return `${repo.owner}/${repo.name}`
}

export function actorLabel(actor?: Pick<Actor, 'login' | 'name'> | null): string {
  if (!actor) return ''
  if (actor.name) return actor.name
  return actor.login.startsWith('did:') ? shortDid(actor.login) : actor.login
}

/** Display number (`#42`) of a thread. */
export function threadNumberOf(ref: ThreadRef): string {
  return ref.displayNumber ?? (ref.forge === 'tangled' ? threadRouteId(ref) : (ref.number ?? ''))
}

/** Whether a thread is a draft pull request. */
export function isDraftPull(thread: Pick<Thread, 'isDraft' | 'ref'>): boolean {
  return thread.isDraft
}

export function commentKey(ref: CommentRef): string {
  return ref.id
}

/** The state the UI shows: a draft is an open pull request flagged as such. */
export function uiStateOf(thread: Pick<Thread, 'isDraft' | 'state'>): string {
  return thread.state === 'open' && thread.isDraft ? 'draft' : thread.state
}
