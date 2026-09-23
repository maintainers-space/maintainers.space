import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { githubProvider } from './index'

const { githubFetchMock } = vi.hoisted(() => ({ githubFetchMock: vi.fn() }))

mockNuxtImport('$fetch', () => githubFetchMock)

const repo = { owner: 'acme', name: 'widgets' }
const comments = Array.from({ length: 101 }, (_, index) => ({
  id: index + 1,
  body: `Comment ${index + 1}`
}))

function mockFetch(detailPath: string) {
  githubFetchMock.mockImplementation(
    async (url: string, options?: { query?: { page?: number } }) => {
      if (url.endsWith('/issues/7/comments')) {
        return options?.query?.page === 2 ? comments.slice(100) : comments.slice(0, 100)
      }
      if (url.endsWith(detailPath)) return { number: 7, title: 'Example', state: 'open' }
      throw new Error(`Unexpected request: ${url}`)
    }
  )
}

function expectAllCommentPages() {
  const commentRequests = githubFetchMock.mock.calls.filter(([url]) =>
    String(url).endsWith('/issues/7/comments')
  )
  expect(commentRequests).toHaveLength(2)
  expect(commentRequests.map(([, options]) => options.query)).toEqual([
    { per_page: 100, page: 1 },
    { per_page: 100, page: 2 }
  ])
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('githubProvider comment pagination', () => {
  it('loads every page of issue comments', async () => {
    mockFetch('/issues/7')

    const issue = await githubProvider.features.issueRead!.getIssue!(repo, '7')

    expect(issue.comments).toHaveLength(101)
    expect(issue.comments.at(-1)?.body).toBe('Comment 101')
    expectAllCommentPages()
  })

  it('loads every page of pull request comments', async () => {
    mockFetch('/pulls/7')

    const pull = await githubProvider.features.pullRead!.getPull!(repo, '7')

    expect(pull.comments).toHaveLength(101)
    expect(pull.comments.at(-1)?.body).toBe('Comment 101')
    expectAllCommentPages()
  })
})

describe('githubProvider review threads', () => {
  it('loads every page of pull request review comments and groups replies', async () => {
    const reviewComments = Array.from({ length: 101 }, (_, index) => ({
      id: index + 1,
      body: `Review comment ${index + 1}`,
      path: 'src/a.ts',
      pull_request_review_id: 5,
      in_reply_to_id: index === 100 ? 1 : undefined
    }))
    githubFetchMock.mockImplementation(
      async (url: string, options?: { query?: { page?: number } }) => {
        if (url.endsWith('/pulls/7/comments')) {
          return options?.query?.page === 2
            ? reviewComments.slice(100)
            : reviewComments.slice(0, 100)
        }
        throw new Error(`Unexpected request: ${url}`)
      }
    )

    const threads = await githubProvider.features.pullRead!.listPullReviewThreads!(repo, '7')

    expect(threads).toHaveLength(100)
    expect(threads[0]!.reviewId).toBe('5')
    expect(threads[0]!.replies?.map((reply) => reply.body)).toEqual(['Review comment 101'])
    expect(githubFetchMock).toHaveBeenCalledTimes(2)
  })
})
