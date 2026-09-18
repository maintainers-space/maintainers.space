import { describe, expect, it } from 'vitest'
import type { ForgeComment, ForgePullReview } from '../app/types/forge'
import { buildPullTimeline } from '../app/utils/pull-conversation'

function comment(id: string, createdAt: string): ForgeComment {
  return { id, body: '', createdAt }
}

function review(id: string, submittedAt?: string): ForgePullReview {
  return { id, state: 'COMMENTED', submittedAt, comments: [] }
}

describe('buildPullTimeline', () => {
  it('merges comments and reviews by their anchor timestamp', () => {
    // Chronology: comment(c1) at t1, review(r1) at t2, comment(c2) at t3.
    const result = buildPullTimeline(
      [comment('c1', '2024-01-01T00:00:00Z'), comment('c2', '2024-01-03T00:00:00Z')],
      [review('r1', '2024-01-02T00:00:00Z')]
    )
    expect(result.map((i) => i.key)).toEqual(['comment:c1', 'review:r1', 'comment:c2'])
    expect(result[1]!.kind).toBe('review')
    expect(result[1]!.review!.id).toBe('r1')
  })

  it('holds a review before comments that followed it even when the inputs are not pre-sorted', () => {
    // The page passes both lists oldest-first, but the merge must not rely on that.
    const result = buildPullTimeline(
      [comment('c2', '2024-01-03T00:00:00Z'), comment('c1', '2024-01-01T00:00:00Z')],
      [review('r1', '2024-01-02T00:00:00Z')]
    )
    expect(result.map((i) => i.key)).toEqual(['comment:c1', 'review:r1', 'comment:c2'])
  })

  it('sinks entries without a usable timestamp to the end, stable', () => {
    const result = buildPullTimeline(
      [comment('c1', '2024-01-01T00:00:00Z'), comment('c2', undefined)],
      [review('r1', '2024-01-02T00:00:00Z'), review('r2', undefined)]
    )
    expect(result.map((i) => i.key)).toEqual(['comment:c1', 'review:r1', 'comment:c2', 'review:r2'])
  })

  it('keeps empty inputs empty', () => {
    expect(buildPullTimeline([], [])).toEqual([])
  })
})
