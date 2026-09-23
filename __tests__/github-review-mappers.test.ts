import { describe, expect, it } from 'vitest'

import { mapPullReview, mapPullReviewComments } from '../app/lib/forges/github/mappers'
import type {
  GhPullReviewCommentResponse,
  GhPullReviewResponse
} from '../app/lib/forges/github/types'

describe('mapPullReview', () => {
  it('maps a submitted review with its state and summary', () => {
    const raw: GhPullReviewResponse = {
      id: 12,
      user: { login: 'alice', avatar_url: 'a.png' },
      body: 'LGTM, ship it!',
      state: 'APPROVED',
      submitted_at: '2024-01-02T03:04:05Z',
      html_url: 'https://github.com/o/r/pull/1#pullrequestreview-12'
    }
    const review = mapPullReview(raw)
    expect(review.id).toBe('12')
    expect(review.state).toBe('APPROVED')
    expect(review.author?.login).toBe('alice')
    expect(review.body).toBe('LGTM, ship it!')
    expect(review.submittedAt).toBe('2024-01-02T03:04:05Z')
    expect(review.comments).toEqual([])
  })

  it('falls back to UNKNOWN for unrecognised states', () => {
    expect(mapPullReview({ id: 1, state: 'random' }).state).toBe('UNKNOWN')
  })
})

describe('mapPullReviewComments', () => {
  it('groups replies under their parent thread', () => {
    const comments: GhPullReviewCommentResponse[] = [
      {
        id: 1,
        body: 'Use a const here',
        path: 'src/a.ts',
        line: 12,
        position: 4,
        diff_hunk: '@@ -1,3 +1,3 @@',
        user: { login: 'alice' }
      },
      {
        id: 2,
        body: 'Done',
        path: 'src/a.ts',
        line: 12,
        in_reply_to_id: 1,
        user: { login: 'bob' }
      }
    ]
    const threads = mapPullReviewComments(comments)
    expect(threads).toHaveLength(1)
    expect(threads[0]!.id).toBe('1')
    expect(threads[0]!.path).toBe('src/a.ts')
    expect(threads[0]!.line).toBe(12)
    expect(threads[0]!.isOutdated).toBe(false)
    expect(threads[0]!.replies).toHaveLength(1)
    expect(threads[0]!.replies![0]!.body).toBe('Done')
    expect(threads[0]!.replies![0]!.replyToId).toBe('1')
  })

  it('marks comments without a current line as outdated', () => {
    const threads = mapPullReviewComments([
      { id: 7, body: 'old', path: 'b.ts', position: null, user: {} }
    ])
    expect(threads[0]!.isOutdated).toBe(true)
    expect(threads[0]!.line).toBeUndefined()
  })

  it('does not mark file-level comments as outdated', () => {
    const threads = mapPullReviewComments([
      { id: 8, body: 'nit on this file', path: 'b.ts', subject_type: 'file', user: {} }
    ])
    expect(threads[0]!.isOutdated).toBe(false)
  })

  it('records the review each comment was submitted with', () => {
    const threads = mapPullReviewComments([
      { id: 9, body: 'nit', path: 'c.ts', pull_request_review_id: 42, user: {} },
      { id: 10, body: 'draft', path: 'c.ts', pull_request_review_id: null, user: {} }
    ])
    expect(threads.map((thread) => thread.reviewId)).toEqual(['42', undefined])
  })
})
