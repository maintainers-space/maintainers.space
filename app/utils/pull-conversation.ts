import type { ForgeComment, ForgePullReview } from '~/types/forge'

/** One entry in a pull request's conversation timeline. */
export type PullConversationItem =
  | { key: string; kind: 'comment'; comment: ForgeComment; at?: string | null }
  | { key: string; kind: 'review'; review: ForgePullReview; at?: string | null }

// Array.prototype.sort is stable, so an entry without a timestamp keeps its
// place relative to peers and only sinks below every timestamped entry.
const anchorAt = (at?: string | null): number => {
  const t = at ? new Date(at).getTime() : Number.POSITIVE_INFINITY
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t
}

/**
 * Merge PR body comments and submitted reviews into a single chronological
 * conversation timeline. Both inputs arrive oldest-first; the result is sorted
 * by each entry's anchor timestamp (comment.createdAt / review.submittedAt) so
 * reviews and the comments they happened between read in real order, matching
 * GitHub. Items without a usable timestamp sink to the end, stable.
 */
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
