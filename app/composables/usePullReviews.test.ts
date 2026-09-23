import { describe, expect, it, vi } from 'vitest'
import type { ForgePullReview, Paginated } from '~/types/forge'
import { fetchPullReviewActivity } from './usePullReviews'

const repo = { owner: 'octo', name: 'timeline' }

function review(id: string): ForgePullReview {
  return { id, state: 'APPROVED', comments: [] }
}

describe('fetchPullReviewActivity', () => {
  it('follows every review page and loads the inline threads', async () => {
    const pages: Record<string, Paginated<ForgePullReview>> = {
      first: { items: [review('1')], cursor: '2' },
      '2': { items: [review('2')], cursor: '3' },
      '3': { items: [review('3')] }
    }
    const listPullReviews = vi.fn(async (_repo, _id, opts?: { cursor?: string }) => {
      return pages[opts?.cursor ?? 'first']!
    })
    const listPullReviewThreads = vi.fn(async () => [])

    const activity = await fetchPullReviewActivity(
      { listPullReviews, listPullReviewThreads },
      repo,
      '7'
    )

    expect(activity.reviews.map((item) => item.id)).toEqual(['1', '2', '3'])
    expect(listPullReviews.mock.calls.map(([, , opts]) => opts?.cursor)).toEqual([
      undefined,
      '2',
      '3'
    ])
    expect(listPullReviewThreads).toHaveBeenCalledWith(repo, '7')
  })

  it('fails instead of looping when a provider repeats a cursor', async () => {
    const listPullReviews = vi.fn(async (_repo, _id, opts?: { cursor?: string }) => ({
      items: [review(opts?.cursor ?? 'first')],
      cursor: opts?.cursor === 'b' ? 'a' : opts?.cursor ? 'b' : 'a'
    }))

    await expect(fetchPullReviewActivity({ listPullReviews }, repo, '7')).rejects.toThrow(
      'Review pagination repeated cursor a'
    )
    expect(listPullReviews).toHaveBeenCalledTimes(3)
  })
})
