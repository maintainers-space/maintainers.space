import type { Review } from 'forges'
import { describe, expect, it } from 'vitest'
import { summarizePullReviews } from './pull-metadata'

const thread = {
  forge: 'github',
  instance: 'github.com',
  kind: 'pull_request',
  number: '1',
  repo: { forge: 'github', instance: 'github.com', name: 'r', owner: 'o' }
} as const

function review(id: string, login: string | undefined, state: Review['state']): Review {
  return {
    author: login
      ? { forge: 'github', id: login, instance: 'github.com', isBotHint: false, login }
      : undefined,
    comments: [],
    raw: null,
    ref: { forge: 'github', id, instance: 'github.com', thread },
    state
  }
}

describe('summarizePullReviews', () => {
  it('keeps each reviewer’s latest decision across comment-only follow-ups', () => {
    const summary = summarizePullReviews([
      review('1', 'bob', 'changes_requested'),
      review('2', 'carol', 'commented'),
      review('3', 'bob', 'commented'),
      review('4', 'carol', 'approved'),
      review('5', 'dave', 'approved'),
      review('6', 'dave', 'dismissed')
    ])

    expect(summary.reviewers.map(({ key, state }) => [key, state])).toEqual([
      ['bob', 'changes_requested'],
      ['carol', 'approved'],
      ['dave', 'dismissed']
    ])
    expect(summary.reviewCount).toBe(6)
    expect(summary.approvals).toBe(1)
    expect(summary.changesRequested).toBe(1)
  })

  it('lets a new approval replace an earlier change request', () => {
    const summary = summarizePullReviews([
      review('1', 'bob', 'changes_requested'),
      review('2', 'bob', 'approved')
    ])

    expect(summary.reviewers.map(({ key, state }) => [key, state])).toEqual([['bob', 'approved']])
    expect(summary.changesRequested).toBe(0)
  })

  it('ignores pending reviews and the author’s own replies', () => {
    const summary = summarizePullReviews(
      [
        review('1', 'octo', 'commented'),
        review('2', 'bob', 'pending'),
        review('3', 'carol', 'unknown')
      ],
      'octo'
    )

    expect(summary.reviewers.map(({ key, state }) => [key, state])).toEqual([
      ['carol', 'commented']
    ])
    expect(summary.reviewCount).toBe(1)
  })

  it('keeps anonymous reviews apart instead of merging them', () => {
    const summary = summarizePullReviews([
      review('1', undefined, 'approved'),
      review('2', undefined, 'approved')
    ])

    expect(summary.reviewers.map(({ key }) => key)).toEqual(['review:1', 'review:2'])
    expect(summary.approvals).toBe(2)
  })
})
