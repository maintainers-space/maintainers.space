import { describe, expect, it } from 'vitest'
import type { ForgeComment, ForgePullReview, ForgePullReviewComment } from '~/types/forge'
import {
  arrangePullTimeline,
  buildPullTimeline,
  diffHunkExcerpt,
  findReviewComment
} from './pull-timeline'

function comment(id: string, createdAt: string | null): ForgeComment {
  return { id, body: `Comment ${id}`, createdAt }
}

function review(
  id: string,
  submittedAt: string | null,
  overrides: Partial<ForgePullReview> = {}
): ForgePullReview {
  return { id, state: 'COMMENTED', body: `Review ${id}`, submittedAt, comments: [], ...overrides }
}

function thread(
  id: string,
  reviewId: string | undefined,
  createdAt: string,
  replies: ForgePullReviewComment[] = []
): ForgePullReviewComment {
  return { id, reviewId, body: `Thread ${id}`, path: 'src/a.ts', line: 3, createdAt, replies }
}

describe('buildPullTimeline', () => {
  it('attaches inline threads to the review they were submitted with', () => {
    const entries = buildPullTimeline(
      [],
      [review('r1', '2024-01-02T00:00:00Z')],
      [thread('t1', 'r1', '2024-01-02T00:00:00Z'), thread('t2', 'r1', '2024-01-02T00:00:01Z')]
    )

    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ kind: 'review', key: 'review:r1' })
    expect(entries[0]!.kind === 'review' && entries[0]!.threads.map((t) => t.id)).toEqual([
      't1',
      't2'
    ])
  })

  it('keeps threads without a known review as standalone entries', () => {
    const entries = buildPullTimeline(
      [],
      [],
      [thread('t1', 'missing', '2024-01-02T00:00:00Z'), thread('t2', undefined, '2024-01-03')]
    )

    expect(entries.map((entry) => entry.key)).toEqual(['thread:t1', 'thread:t2'])
  })

  it('drops empty comment-only reviews that exist only to carry thread replies', () => {
    const entries = buildPullTimeline(
      [],
      [
        review('reply-carrier', '2024-01-03T00:00:00Z', { body: '  ' }),
        review('approval', '2024-01-04T00:00:00Z', { state: 'APPROVED', body: '' })
      ],
      []
    )

    expect(entries.map((entry) => entry.key)).toEqual(['review:approval'])
  })
})

describe('arrangePullTimeline', () => {
  const entries = buildPullTimeline(
    [comment('c1', '2024-01-01T00:00:00Z'), comment('c2', '2024-01-03T00:00:00Z')],
    [review('r1', '2024-01-02T00:00:00Z')],
    [thread('t1', undefined, '2024-01-04T00:00:00Z')]
  )

  it('interleaves comments, reviews and threads chronologically', () => {
    expect(arrangePullTimeline(entries, 'all', 'oldest').map((entry) => entry.key)).toEqual([
      'comment:c1',
      'review:r1',
      'comment:c2',
      'thread:t1'
    ])
  })

  it('reverses the order for newest first', () => {
    expect(arrangePullTimeline(entries, 'all', 'newest').map((entry) => entry.key)).toEqual([
      'thread:t1',
      'comment:c2',
      'review:r1',
      'comment:c1'
    ])
  })

  it('filters to comments or to review activity', () => {
    expect(arrangePullTimeline(entries, 'comments', 'oldest').map((entry) => entry.key)).toEqual([
      'comment:c1',
      'comment:c2'
    ])
    expect(arrangePullTimeline(entries, 'reviews', 'oldest').map((entry) => entry.key)).toEqual([
      'review:r1',
      'thread:t1'
    ])
  })

  it('places undated entries last while keeping their original order', () => {
    const undated = buildPullTimeline(
      [comment('a', null), comment('b', '2024-01-01T00:00:00Z'), comment('c', 'not a date')],
      [review('pending', null, { state: 'PENDING' })],
      []
    )

    expect(arrangePullTimeline(undated, 'all', 'oldest').map((entry) => entry.key)).toEqual([
      'comment:b',
      'comment:a',
      'comment:c',
      'review:pending'
    ])
  })
})

describe('findReviewComment', () => {
  it('finds nested replies', () => {
    const reply = thread('reply', 'r1', '2024-01-02T00:00:00Z')
    const threads = [thread('root', 'r1', '2024-01-01T00:00:00Z', [reply])]

    expect(findReviewComment(threads, 'reply')).toBe(reply)
    expect(findReviewComment(threads, 'unknown')).toBeUndefined()
  })
})

describe('diffHunkExcerpt', () => {
  const hunk = [
    '@@ -1,6 +1,7 @@',
    ' one',
    ' two',
    '-three',
    '+THREE',
    '+four',
    ' ',
    '\\ No newline at end of file'
  ].join('\n')

  it('returns the last four lines of the hunk without metadata', () => {
    expect(diffHunkExcerpt(hunk, 5)).toEqual([
      { type: 'del', text: 'three' },
      { type: 'add', text: 'THREE' },
      { type: 'add', text: 'four' },
      { type: 'ctx', text: '' }
    ])
  })

  it('widens the excerpt to cover a multi-line comment', () => {
    expect(diffHunkExcerpt(hunk, 6, 1)).toHaveLength(6)
  })

  it('returns nothing without a hunk', () => {
    expect(diffHunkExcerpt(null)).toEqual([])
  })
})
