import { describe, expect, it } from 'vitest'
import type { ForgeComment, ForgePullReview, ForgeTimelineEvent } from '../app/types/forge'
import { buildPullTimeline, filterTimeline } from '../app/utils/pull-conversation'
import { commentLocation, reviewStateLabel } from '../app/utils/pull-review'

function comment(id: string, createdAt: string): ForgeComment {
  return { id, body: '', createdAt }
}

function review(
  id: string,
  submittedAt?: string,
  comments: ForgePullReview['comments'] = []
): ForgePullReview {
  return { id, state: 'COMMENTED', submittedAt, comments }
}

function event(
  id: string,
  kind: ForgeTimelineEvent['kind'],
  createdAt: string
): ForgeTimelineEvent {
  return { id, kind, createdAt }
}

describe('buildPullTimeline', () => {
  it('merges comments and reviews by their anchor timestamp', () => {
    const result = buildPullTimeline(
      [comment('c1', '2024-01-01T00:00:00Z'), comment('c2', '2024-01-03T00:00:00Z')],
      [review('r1', '2024-01-02T00:00:00Z')],
      []
    )
    expect(result.map((i) => i.key)).toEqual(['comment:c1', 'review:r1', 'comment:c2'])
    expect(result[1]!.kind).toBe('review')
    expect(result[1]!.review!.id).toBe('r1')
  })

  it('holds a review before comments that followed it even when the inputs are not pre-sorted', () => {
    const result = buildPullTimeline(
      [comment('c2', '2024-01-03T00:00:00Z'), comment('c1', '2024-01-01T00:00:00Z')],
      [review('r1', '2024-01-02T00:00:00Z')],
      []
    )
    expect(result.map((i) => i.key)).toEqual(['comment:c1', 'review:r1', 'comment:c2'])
  })

  it('sinks entries without a usable timestamp to the end, stable', () => {
    const result = buildPullTimeline(
      [comment('c1', '2024-01-01T00:00:00Z'), comment('c2', undefined)],
      [review('r1', '2024-01-02T00:00:00Z'), review('r2', undefined)],
      []
    )
    expect(result.map((i) => i.key)).toEqual(['comment:c1', 'review:r1', 'comment:c2', 'review:r2'])
  })

  it('keeps empty inputs empty', () => {
    expect(buildPullTimeline([], [], [])).toEqual([])
  })

  it('flattens a review into its summary plus one entry per inline thread', () => {
    const reviewed = review('r1', '2024-01-02T00:00:00Z', [
      { id: 't1', body: 'check this', path: 'src/a.ts', line: 5, createdAt: '2024-01-02T00:00:30Z' }
    ])
    const result = buildPullTimeline([comment('c1', '2024-01-01T00:00:00Z')], [reviewed], [])
    expect(result.map((i) => i.key)).toEqual(['comment:c1', 'review:r1', 'thread:r1:t1'])
    expect(result[2]!.kind).toBe('thread')
    expect(result[2]!.comment!.path).toBe('src/a.ts')
  })

  it('reverses top-level entries when ascending then descending', () => {
    const reviewed = review('r1', '2024-01-02T00:00:00Z', [
      { id: 't1', body: '', path: 'src/a.ts', createdAt: '2024-01-02T00:00:30Z' }
    ])
    const input = [comment('c1', '2024-01-01T00:00:00Z')]
    const asc = buildPullTimeline(input, [reviewed], []).map((i) => i.key)
    const desc = buildPullTimeline(input, [reviewed], [], true).map((i) => i.key)
    expect(desc).toEqual([...asc].toReversed())
  })

  it('interleaves timeline events with comments and reviews by timestamp', () => {
    const result = buildPullTimeline(
      [comment('c1', '2024-01-01T00:00:00Z')],
      [review('r1', '2024-01-03T00:00:00Z')],
      [event('e1', 'labeled', '2024-01-02T00:00:00Z')]
    )
    expect(result.map((i) => i.key)).toEqual(['comment:c1', 'event:e1', 'review:r1'])
    expect(result[1]!.kind).toBe('event')
  })

  it('handles multiple event types in sequence', () => {
    const result = buildPullTimeline(
      [],
      [],
      [
        event('e1', 'labeled', '2024-01-01T00:00:00Z'),
        event('e2', 'assigned', '2024-01-02T00:00:00Z'),
        event('e3', 'merged', '2024-01-03T00:00:00Z')
      ]
    )
    expect(result.map((i) => i.key)).toEqual(['event:e1', 'event:e2', 'event:e3'])
  })
})

describe('filterTimeline', () => {
  const items = buildPullTimeline(
    [comment('c1', '2024-01-01T00:00:00Z')],
    [
      review('r1', '2024-01-02T00:00:00Z', [
        { id: 't1', body: '', path: 'src/a.ts', createdAt: '2024-01-02T01:00:00Z' }
      ])
    ],
    [event('e1', 'labeled', '2024-01-03T00:00:00Z')]
  )

  it('returns everything for the all filter', () => {
    expect(filterTimeline(items, 'all').map((i) => i.kind)).toEqual([
      'comment',
      'review',
      'thread',
      'event'
    ])
  })

  it('returns only comments', () => {
    expect(filterTimeline(items, 'comments').map((i) => i.kind)).toEqual(['comment'])
  })

  it('returns only reviews', () => {
    expect(filterTimeline(items, 'reviews').map((i) => i.kind)).toEqual(['review'])
  })

  it('returns only threads', () => {
    expect(filterTimeline(items, 'threads').map((i) => i.kind)).toEqual(['thread'])
  })

  it('returns reviews and events for history', () => {
    expect(filterTimeline(items, 'history').map((i) => i.kind)).toEqual(['review', 'event'])
  })
})

describe('pull-review helpers', () => {
  it('maps review states to friendly labels, falling back to reviewed', () => {
    expect(reviewStateLabel('APPROVED')).toBe('approved these changes')
    expect(reviewStateLabel('CHANGES_REQUESTED')).toBe('requested changes')
    expect(reviewStateLabel('WEIRD')).toBe('reviewed')
  })

  it('describes a thread location as path:line when a line exists', () => {
    expect(commentLocation({ path: 'src/a.ts', line: 5 } as never)).toBe('src/a.ts:5')
    expect(commentLocation({ path: 'src/a.ts' } as never)).toBe('src/a.ts')
  })
})
