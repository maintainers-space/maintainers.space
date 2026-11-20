import type { Comment, Review, ReviewComment } from 'forges'

export const PULL_TIMELINE_FILTERS = ['all', 'comments', 'reviews'] as const
export type PullTimelineFilter = (typeof PULL_TIMELINE_FILTERS)[number]

export const PULL_TIMELINE_SORTS = ['oldest', 'newest'] as const
export type PullTimelineSort = (typeof PULL_TIMELINE_SORTS)[number]

/** An inline conversation on the diff: the comment that started it, then its replies in order. */
export interface ReviewConversation {
  id: string
  replies: ReviewComment[]
  resolved: boolean
  root: ReviewComment
}

export type PullTimelineEntry =
  | { kind: 'comment'; key: string; at?: Date; comment: Comment }
  | { kind: 'review'; key: string; at?: Date; review: Review; conversations: ReviewConversation[] }

/**
 * Groups every inline comment of a pull request into conversations. A reply may sit in a
 * different review than the comment it answers, so conversations are keyed by root comment.
 */
export function groupConversations(reviews: Review[]): Map<string, ReviewConversation[]> {
  const all = reviews.flatMap((review) =>
    (review.comments || []).map((comment) => ({ comment, reviewId: review.ref.id }))
  )
  const byId = new Map(all.map((item) => [item.comment.ref?.id ?? '', item]))
  const rootOf = (comment: ReviewComment): ReviewComment => {
    let current = comment
    const seen = new Set<string>()
    while (current.inReplyTo && !seen.has(current.inReplyTo)) {
      seen.add(current.inReplyTo)
      const parent = byId.get(current.inReplyTo)?.comment
      if (!parent) break
      current = parent
    }
    return current
  }

  const conversations = new Map<string, ReviewConversation>()
  const reviewOfRoot = new Map<string, string>()
  for (const { comment, reviewId } of all) {
    const root = rootOf(comment)
    const id = root.ref?.id ?? ''
    let conversation = conversations.get(id)
    if (!conversation) {
      conversation = { id, replies: [], resolved: root.thread?.resolved ?? false, root }
      conversations.set(id, conversation)
    }
    if (comment !== root) conversation.replies.push(comment)
    else reviewOfRoot.set(id, reviewId)
  }

  const byReview = new Map<string, ReviewConversation[]>()
  for (const [id, conversation] of conversations) {
    conversation.replies.sort(
      (a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0)
    )
    const reviewId = reviewOfRoot.get(id)
    if (reviewId === undefined) continue
    byReview.set(reviewId, [...(byReview.get(reviewId) ?? []), conversation])
  }
  return byReview
}

export function buildPullTimeline(comments: Comment[], reviews: Review[]): PullTimelineEntry[] {
  const byReview = groupConversations(reviews)
  const entries: PullTimelineEntry[] = comments.map((comment) => ({
    kind: 'comment',
    key: `comment:${comment.ref.id}`,
    at: comment.createdAt,
    comment
  }))

  for (const review of reviews) {
    const conversations = byReview.get(review.ref.id) ?? []
    if (review.state === 'commented' && !review.body?.trim() && !conversations.length) continue
    entries.push({
      kind: 'review',
      key: `review:${review.ref.id}`,
      at: review.submittedAt,
      review,
      conversations
    })
  }

  return entries
}

function timestamp(entry: PullTimelineEntry): number {
  const time = entry.at?.getTime() ?? Number.NaN
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time
}

export function arrangePullTimeline(
  entries: PullTimelineEntry[],
  filter: PullTimelineFilter,
  sort: PullTimelineSort
): PullTimelineEntry[] {
  const ordered = entries
    .filter((entry) => filter === 'all' || (filter === 'comments') === (entry.kind === 'comment'))
    .map((entry) => ({ entry, time: timestamp(entry) }))
    .sort((a, b) => (a.time === b.time ? 0 : a.time < b.time ? -1 : 1))
    .map(({ entry }) => entry)
  return sort === 'newest' ? ordered.toReversed() : ordered
}
