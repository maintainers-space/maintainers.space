import type { ForgeComment, ForgePullReview } from '~/types/forge'

export type PullConversationItem =
  | { key: string; kind: 'comment'; comment: ForgeComment; at?: string | null }
  | { key: string; kind: 'review'; review: ForgePullReview; at?: string | null }

const anchorAt = (at?: string | null): number => {
  const t = at ? new Date(at).getTime() : Number.POSITIVE_INFINITY
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t
}

export function buildPullTimeline(
  comments: ForgeComment[],
  reviews: ForgePullReview[]
): PullConversationItem[] {
  const items: PullConversationItem[] = []
  for (const comment of comments) {
    items.push({ key: `comment:${comment.id}`, kind: 'comment', comment, at: comment.createdAt })
  }
  for (const review of reviews) {
    items.push({ key: `review:${review.id}`, kind: 'review', review, at: review.submittedAt })
  }
  return items.sort((a, b) => anchorAt(a.at) - anchorAt(b.at))
}
