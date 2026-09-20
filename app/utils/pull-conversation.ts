import type {
  ForgeComment,
  ForgePullReview,
  ForgePullReviewComment,
  ForgeTimelineEvent
} from '~/types/forge'

export type PullConversationItem =
  | { key: string; kind: 'comment'; comment: ForgeComment; at?: string | null }
  | { key: string; kind: 'review'; review: ForgePullReview; at?: string | null }
  | {
      key: string
      kind: 'thread'
      review: ForgePullReview
      comment: ForgePullReviewComment
      at?: string | null
    }
  | { key: string; kind: 'event'; event: ForgeTimelineEvent; at?: string | null }

/** Filter presets matching GitLab's activity filter dropdown. */
export type PullTimelineFilter = 'all' | 'comments' | 'reviews' | 'threads' | 'history'

const anchorAt = (at?: string | null): number => {
  const t = at ? new Date(at).getTime() : Number.POSITIVE_INFINITY
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t
}

export function buildPullTimeline(
  comments: ForgeComment[],
  reviews: ForgePullReview[],
  events: ForgeTimelineEvent[],
  descending = false
): PullConversationItem[] {
  const items: PullConversationItem[] = []
  for (const comment of comments) {
    items.push({ key: `comment:${comment.id}`, kind: 'comment', comment, at: comment.createdAt })
  }
  for (const review of reviews) {
    items.push({ key: `review:${review.id}`, kind: 'review', review, at: review.submittedAt })
    for (const comment of review.comments) {
      items.push({
        key: `thread:${review.id}:${comment.id}`,
        kind: 'thread',
        review,
        comment,
        at: comment.createdAt
      })
    }
  }
  for (const event of events) {
    items.push({ key: `event:${event.id}`, kind: 'event', event, at: event.createdAt })
  }
  items.sort((a, b) => anchorAt(a.at) - anchorAt(b.at))
  return descending ? items.toReversed() : items
}

export function filterTimeline(
  items: PullConversationItem[],
  kinds: PullConversationItem['kind'][]
): PullConversationItem[] {
  const allowed = new Set(kinds)
  return items.filter((item) => allowed.has(item.kind))
}
