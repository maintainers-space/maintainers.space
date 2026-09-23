import { describe, expect, it } from 'vitest'
import type { ForgePullReview } from '~/types/forge'
import { summarizePullReviews } from './pull-metadata'

function review(
  id: string,
  login: string | undefined,
  state: ForgePullReview['state']
): ForgePullReview {
  return {
    id,
    state,
    author: login ? { provider: 'github', login } : undefined,
    submittedAt: null,
    comments: []
  }
}

describe('summarizePullReviews', () => {
  it('keeps each reviewer’s latest decision across comment-only follow-ups', () => {
    const summary = summarizePullReviews([
      review('1', 'bob', 'CHANGES_REQUESTED'),
      review('2', 'carol', 'COMMENTED'),
      review('3', 'bob', 'COMMENTED'),
      review('4', 'carol', 'APPROVED'),
      review('5', 'dave', 'APPROVED'),
      review('6', 'dave', 'DISMISSED')
    ])

    expect(summary.reviewers.map(({ key, state }) => [key, state])).toEqual([
      ['bob', 'CHANGES_REQUESTED'],
      ['carol', 'APPROVED'],
      ['dave', 'DISMISSED']
    ])
    expect(summary.reviewCount).toBe(6)
    expect(summary.approvals).toBe(1)
    expect(summary.changesRequested).toBe(1)
  })

  it('lets a new approval replace an earlier change request', () => {
    const summary = summarizePullReviews([
      review('1', 'bob', 'CHANGES_REQUESTED'),
      review('2', 'bob', 'APPROVED')
    ])

    expect(summary.reviewers).toEqual([
      { key: 'bob', user: { provider: 'github', login: 'bob' }, state: 'APPROVED' }
    ])
    expect(summary.changesRequested).toBe(0)
  })

  it('ignores pending reviews and the author’s own replies', () => {
    const summary = summarizePullReviews(
      [
        review('1', 'octo', 'COMMENTED'),
        review('2', 'bob', 'PENDING'),
        review('3', 'carol', 'UNKNOWN')
      ],
      'octo'
    )

    expect(summary.reviewers.map(({ key, state }) => [key, state])).toEqual([
      ['carol', 'COMMENTED']
    ])
    expect(summary.reviewCount).toBe(1)
  })

  it('keeps anonymous reviews apart instead of merging them', () => {
    const summary = summarizePullReviews([
      review('1', undefined, 'APPROVED'),
      review('2', undefined, 'APPROVED')
    ])

    expect(summary.reviewers.map(({ key }) => key)).toEqual(['review:1', 'review:2'])
    expect(summary.approvals).toBe(2)
  })
})
