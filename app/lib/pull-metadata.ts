import type { Actor, Review } from 'forges'

export type PullReviewerState = 'approved' | 'changes_requested' | 'commented' | 'dismissed'

export interface PullReviewer {
  key: string
  user?: Actor
  state: PullReviewerState
}

export interface PullReviewSummary {
  reviewCount: number
  approvals: number
  changesRequested: number
  reviewers: PullReviewer[]
}

export function summarizePullReviews(reviews: Review[], authorLogin?: string): PullReviewSummary {
  const reviewers = new Map<string, PullReviewer>()
  let reviewCount = 0
  for (const review of reviews) {
    if (review.state === 'pending') continue
    const key = review.author?.login ?? `review:${review.ref.id}`
    if (authorLogin && key === authorLogin) continue
    reviewCount++
    const { state } = review
    if (state === 'approved' || state === 'changes_requested' || state === 'dismissed') {
      reviewers.set(key, { key, user: review.author, state })
    } else if (!reviewers.has(key)) {
      reviewers.set(key, { key, user: review.author, state: 'commented' })
    }
  }
  const list = [...reviewers.values()]
  return {
    reviewCount,
    approvals: list.filter((r) => r.state === 'approved').length,
    changesRequested: list.filter((r) => r.state === 'changes_requested').length,
    reviewers: list
  }
}
