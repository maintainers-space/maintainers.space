import type { ForgeComment, ForgePullReview, ForgePullReviewComment } from '~/types/forge'

export const PULL_TIMELINE_FILTERS = ['all', 'comments', 'reviews'] as const
export type PullTimelineFilter = (typeof PULL_TIMELINE_FILTERS)[number]

export const PULL_TIMELINE_SORTS = ['oldest', 'newest'] as const
export type PullTimelineSort = (typeof PULL_TIMELINE_SORTS)[number]

export type PullTimelineEntry =
  | { kind: 'comment'; key: string; at?: string | null; comment: ForgeComment }
  | {
      kind: 'review'
      key: string
      at?: string | null
      review: ForgePullReview
      threads: ForgePullReviewComment[]
    }
  | { kind: 'thread'; key: string; at?: string | null; thread: ForgePullReviewComment }

export interface DiffExcerptLine {
  type: 'add' | 'del' | 'ctx'
  text: string
}

export function buildPullTimeline(
  comments: ForgeComment[],
  reviews: ForgePullReview[],
  threads: ForgePullReviewComment[]
): PullTimelineEntry[] {
  const reviewIds = new Set(reviews.map((review) => review.id))
  const threadsByReview = new Map<string, ForgePullReviewComment[]>()
  const entries: PullTimelineEntry[] = comments.map((comment) => ({
    kind: 'comment',
    key: `comment:${comment.id}`,
    at: comment.createdAt,
    comment
  }))

  for (const thread of threads) {
    if (thread.reviewId && reviewIds.has(thread.reviewId)) {
      const grouped = threadsByReview.get(thread.reviewId)
      if (grouped) grouped.push(thread)
      else threadsByReview.set(thread.reviewId, [thread])
    } else {
      entries.push({ kind: 'thread', key: `thread:${thread.id}`, at: thread.createdAt, thread })
    }
  }

  for (const review of reviews) {
    const reviewThreads = threadsByReview.get(review.id) ?? []
    if (review.state === 'COMMENTED' && !review.body?.trim() && !reviewThreads.length) continue
    entries.push({
      kind: 'review',
      key: `review:${review.id}`,
      at: review.submittedAt,
      review,
      threads: reviewThreads
    })
  }

  return entries
}

function timestamp(entry: PullTimelineEntry): number {
  const time = entry.at ? Date.parse(entry.at) : Number.NaN
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

export function findReviewComment(
  comments: ForgePullReviewComment[],
  commentId: string
): ForgePullReviewComment | undefined {
  for (const comment of comments) {
    if (comment.id === commentId) return comment
    const reply = findReviewComment(comment.replies ?? [], commentId)
    if (reply) return reply
  }
  return undefined
}

export function diffHunkExcerpt(
  diffHunk: string | null | undefined,
  line?: number,
  startLine?: number
): DiffExcerptLine[] {
  if (!diffHunk) return []
  const span = line && startLine && startLine < line ? line - startLine + 1 : 1
  const count = Math.min(Math.max(span, 4), 12)
  return diffHunk
    .split('\n')
    .filter((text) => text && !text.startsWith('@@') && !text.startsWith('\\'))
    .slice(-count)
    .map((text) => ({
      type: text.startsWith('+') ? 'add' : text.startsWith('-') ? 'del' : 'ctx',
      text: text.slice(1)
    }))
}
