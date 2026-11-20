import type { Comment, Review, ReviewComment } from 'forges'
import { describe, expect, it } from 'vitest'
import { arrangePullTimeline, buildPullTimeline, groupConversations } from './pull-timeline'

const origin = { forge: 'github', instance: 'github.com' } as const
const repo = { ...origin, name: 'r', owner: 'o' }
const threadRef = { ...origin, kind: 'pull_request', number: '1', repo } as const

function date(value: string | null): Date | undefined {
  return value ? new Date(value) : undefined
}

function comment(id: string, createdAt: string | null): Comment {
  return {
    body: `Comment ${id}`,
    createdAt: date(createdAt),
    raw: null,
    ref: { ...origin, id, thread: threadRef }
  }
}

function inline(id: string, createdAt: string, inReplyTo?: string): ReviewComment {
  return {
    body: `Inline ${id}`,
    createdAt: date(createdAt),
    inReplyTo,
    line: 3,
    path: 'src/a.ts',
    raw: null,
    ref: { ...origin, id, thread: threadRef }
  }
}

function review(id: string, submittedAt: string | null, overrides: Partial<Review> = {}): Review {
  return {
    body: `Review ${id}`,
    comments: [],
    raw: null,
    ref: { ...origin, id, thread: threadRef },
    state: 'commented',
    submittedAt: date(submittedAt),
    ...overrides
  }
}

describe('groupConversations', () => {
  it('nests replies under the comment they answer, even from another review', () => {
    const grouped = groupConversations([
      review('r1', '2024-01-02T00:00:00Z', { comments: [inline('t1', '2024-01-02T00:00:00Z')] }),
      review('r2', '2024-01-03T00:00:00Z', {
        body: '',
        comments: [inline('t2', '2024-01-03T00:00:00Z', 't1')]
      })
    ])

    const conversations = grouped.get('r1')!
    expect(conversations).toHaveLength(1)
    expect(conversations[0]!.replies.map((reply) => reply.ref?.id)).toEqual(['t2'])
    expect(grouped.has('r2')).toBe(false)
  })
})

describe('buildPullTimeline', () => {
  it('attaches inline conversations to the review they were submitted with', () => {
    const entries = buildPullTimeline(
      [],
      [
        review('r1', '2024-01-02T00:00:00Z', {
          comments: [inline('t1', '2024-01-02T00:00:00Z'), inline('t2', '2024-01-02T00:00:01Z')]
        })
      ]
    )

    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ kind: 'review', key: 'review:r1' })
    expect(entries[0]!.kind === 'review' && entries[0]!.conversations.map((c) => c.id)).toEqual([
      't1',
      't2'
    ])
  })

  it('drops empty comment-only reviews that exist only to carry thread replies', () => {
    const entries = buildPullTimeline(
      [],
      [
        review('reply-carrier', '2024-01-03T00:00:00Z', { body: '  ' }),
        review('approval', '2024-01-04T00:00:00Z', { body: '', state: 'approved' })
      ]
    )

    expect(entries.map((entry) => entry.key)).toEqual(['review:approval'])
  })
})

describe('arrangePullTimeline', () => {
  const entries = buildPullTimeline(
    [comment('c1', '2024-01-01T00:00:00Z'), comment('c2', '2024-01-03T00:00:00Z')],
    [review('r1', '2024-01-02T00:00:00Z')]
  )

  it('interleaves comments and reviews chronologically', () => {
    expect(arrangePullTimeline(entries, 'all', 'oldest').map((entry) => entry.key)).toEqual([
      'comment:c1',
      'review:r1',
      'comment:c2'
    ])
  })

  it('reverses the order for newest first', () => {
    expect(arrangePullTimeline(entries, 'all', 'newest').map((entry) => entry.key)).toEqual([
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
      'review:r1'
    ])
  })

  it('places undated entries last while keeping their original order', () => {
    const undated = buildPullTimeline(
      [comment('a', null), comment('b', '2024-01-01T00:00:00Z')],
      [review('pending', null, { state: 'pending' })]
    )

    expect(arrangePullTimeline(undated, 'all', 'oldest').map((entry) => entry.key)).toEqual([
      'comment:b',
      'comment:a',
      'review:pending'
    ])
  })
})
