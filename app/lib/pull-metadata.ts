import type { ForgePullReview, ForgeUser } from '~/types/forge'

export type PullReviewerState = 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED'

export interface PullReviewer {
  key: string
  user?: ForgeUser
  state: PullReviewerState
}

export interface PullReviewSummary {
  reviewCount: number
  approvals: number
  changesRequested: number
  reviewers: PullReviewer[]
}

export function summarizePullReviews(
  reviews: ForgePullReview[],
  authorLogin?: string
): PullReviewSummary {
  const reviewers = new Map<string, PullReviewer>()
  let reviewCount = 0
  for (const review of reviews) {
    if (review.state === 'PENDING') continue
    const key = review.author?.login ?? `review:${review.id}`
    if (authorLogin && key === authorLogin) continue
    reviewCount++
    const { state } = review
    if (state === 'APPROVED' || state === 'CHANGES_REQUESTED' || state === 'DISMISSED') {
      reviewers.set(key, { key, user: review.author, state })
    } else if (!reviewers.has(key)) {
      reviewers.set(key, { key, user: review.author, state: 'COMMENTED' })
    }
  }
  const list = [...reviewers.values()]
  return {
    reviewCount,
    approvals: list.filter((r) => r.state === 'APPROVED').length,
    changesRequested: list.filter((r) => r.state === 'CHANGES_REQUESTED').length,
    reviewers: list
  }
}
