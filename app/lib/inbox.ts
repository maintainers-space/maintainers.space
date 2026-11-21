// The inbox joins package notifications with the threads they point at, so a card can show
// state, author and unread comments without opening anything. Items are plain JSON so they can
// sit in the response cache.
import type { ForgeProvider, Notification, NotificationRef, Thread, ThreadRef } from 'forges'
import { notificationThread } from 'forges'

import { threadPathOf, repoFullName } from '~/utils/forge-model'
import { forgeIdOf } from '~/lib/forges/registry'

export type InboxKind =
  | 'pull'
  | 'issue'
  | 'discussion'
  | 'commit'
  | 'release'
  | 'mention'
  | 'ci'
  | 'other'
export type BotKind = 'dependabot' | 'renovate'

export interface InboxComment {
  author?: { avatarUrl?: string; login: string; name?: string }
  body: string
  createdAt?: string
  id: string
}

export interface InboxItem {
  author?: { avatarUrl?: string; login: string; name?: string }
  botKind?: BotKind
  id: string
  isBot: boolean
  kind: InboxKind
  notification: NotificationRef
  number?: string
  provider: string
  reason: string
  repo?: { fullName: string; name: string; owner: string }
  resolved: boolean
  state?: string
  thread?: ThreadRef
  title: string
  to?: string
  unread: boolean
  unreadComments: InboxComment[]
  updatedAt: string
  url?: string
}

/** How many threads are enriched per forge; the rest render from the notification alone. */
const ENRICH_LIMIT = 30

const BOT_RE: Array<[BotKind, RegExp]> = [
  ['dependabot', /^(?:app\/)?dependabot(?:-preview)?(?:\[bot\])?$/i],
  ['renovate', /^(?:app\/)?renovate(?:\[bot\])?$/i]
]

export function botKindOf(login?: string): BotKind | undefined {
  return BOT_RE.find(([, re]) => re.test(login ?? ''))?.[0]
}

function kindOf(notification: Notification): InboxKind {
  if (notification.reason === 'mention' || notification.reason === 'team_mention') return 'mention'
  if (notification.reason === 'ci_activity') return 'ci'
  const { subject } = notification
  if (subject.type === 'release') return 'release'
  if (subject.type === 'commit') return 'commit'
  if (subject.type !== 'thread') return 'other'
  switch (subject.thread.kind) {
    case 'pull_request':
      return 'pull'
    case 'issue':
      return 'issue'
    case 'discussion':
      return 'discussion'
    default:
      return 'other'
  }
}

export function toInboxItem(
  notification: Notification,
  thread?: Thread,
  comments: InboxComment[] = []
): InboxItem {
  const ref = notificationThread(notification)
  const repo =
    ref?.repo ?? (notification.subject.type === 'repo' ? notification.subject.repo : undefined)
  const author = thread?.author
  const state = thread
    ? uiState(thread)
    : notification.subjectState === 'unknown'
      ? undefined
      : notification.subjectState
  return {
    author: author && { avatarUrl: author.avatarUrl, login: author.login, name: author.name },
    botKind: botKindOf(author?.login),
    id: notification.ref.id,
    isBot: !!botKindOf(author?.login) || !!author?.isBotHint,
    kind: kindOf(notification),
    notification: notification.ref,
    number: ref?.displayNumber ?? ref?.number,
    provider: forgeIdOf(notification.ref),
    reason: notification.reason,
    repo: repo && { fullName: repoFullName(repo), name: repo.name, owner: repo.owner },
    resolved: state === 'closed' || state === 'merged',
    state,
    thread: ref,
    title: notification.title,
    to: ref ? threadPathOf(ref) : undefined,
    unread: notification.unread,
    unreadComments: comments,
    updatedAt: notification.updatedAt.toISOString(),
    url: notification.url
  }
}

function uiState(thread: Thread): string {
  return thread.state === 'open' && thread.isDraft ? 'draft' : thread.state
}

/** Recent notifications from one forge, enriched with their threads and unread comments. */
export async function loadInbox(provider: ForgeProvider, limit = 50): Promise<InboxItem[]> {
  const page = await provider.notifications.list({ perPage: limit }).page()
  const notifications = page.items.slice(0, limit)

  const candidates = notifications
    .filter(
      (n) =>
        n.subject.type === 'thread' &&
        (n.subject.thread.kind === 'pull_request' || n.subject.thread.kind === 'issue')
    )
    .slice(0, ENRICH_LIMIT)
  const results = candidates.length
    ? await provider.threads.getMany(candidates.map((n) => notificationThread(n)!))
    : []
  const threads = new Map<string, Thread>()
  for (const [index, result] of results.entries()) {
    if (result.ok) threads.set(candidates[index]!.ref.id, result.thread)
  }

  return Promise.all(
    notifications.map(async (notification) => {
      const thread = threads.get(notification.ref.id)
      const comments: InboxComment[] = []
      if (thread && notification.unread && provider.can('threads.comments', thread.ref.kind)) {
        try {
          const unreadPage = await provider.threads
            .comments(thread.ref, {
              perPage: 5,
              since: notification.lastReadAt
            })
            .page()
          for (const c of unreadPage.items.slice(-3)) {
            comments.push({
              author: c.author && {
                avatarUrl: c.author.avatarUrl,
                login: c.author.login,
                name: c.author.name
              },
              body: c.body,
              createdAt: c.createdAt?.toISOString(),
              id: c.ref.id
            })
          }
        } catch {
          /* unread comments are an extra; the card works without them */
        }
      }
      return toInboxItem(notification, thread, comments)
    })
  )
}
