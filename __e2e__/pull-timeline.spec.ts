import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const API = 'https://api.github.com/repos/octo/timeline'

async function mockPull(
  page: Page,
  { reviewsStatus = 200, body = 'Adds a unified timeline.' } = {}
): Promise<void> {
  await page.route('**/api/**', (route) => route.abort())
  await page.route('https://api.github.com/**', (route) =>
    route.fulfill({ status: 404, json: { message: 'Not Found' } })
  )
  await page.route(API, (route) =>
    route.fulfill({
      json: {
        owner: { login: 'octo' },
        name: 'timeline',
        full_name: 'octo/timeline',
        default_branch: 'main',
        html_url: 'https://github.com/octo/timeline'
      }
    })
  )
  await page.route(`${API}/pulls/3`, (route) =>
    route.fulfill({
      json: {
        number: 3,
        title: 'Add the timeline',
        state: 'open',
        user: { login: 'octo' },
        body,
        labels: [{ name: 'enhancement', color: 'a2eeef' }],
        created_at: '2024-01-01T09:00:00Z',
        updated_at: '2024-01-06T09:00:00Z',
        head: { ref: 'timeline' },
        base: { ref: 'main' },
        html_url: 'https://github.com/octo/timeline/pull/3'
      }
    })
  )
  await page.route(/\/pulls\/3\/(files|commits)(\?.*)?$/, (route) => route.fulfill({ json: [] }))
  await page.route(/\/issues\/3\/comments(\?.*)?$/, (route) =>
    route.fulfill({
      json: [
        {
          id: 1,
          user: { login: 'alice' },
          body: 'Thanks for opening this.',
          created_at: '2024-01-02T09:00:00Z'
        },
        {
          id: 2,
          user: { login: 'octo' },
          body: 'Addressed the feedback.',
          created_at: '2024-01-05T09:00:00Z'
        }
      ]
    })
  )
  await page.route(/\/pulls\/3\/reviews(\?.*)?$/, (route) =>
    reviewsStatus === 200
      ? route.fulfill({
          json: [
            {
              id: 12,
              user: { login: 'bob' },
              body: 'Please address the nits.',
              state: 'CHANGES_REQUESTED',
              submitted_at: '2024-01-03T09:00:00Z',
              html_url: 'https://github.com/octo/timeline/pull/3#pullrequestreview-12'
            },
            {
              id: 13,
              user: { login: 'octo' },
              body: '',
              state: 'COMMENTED',
              submitted_at: '2024-01-04T09:00:00Z'
            },
            {
              id: 14,
              user: { login: 'carol' },
              body: '',
              state: 'APPROVED',
              submitted_at: '2024-01-06T09:00:00Z'
            }
          ]
        })
      : route.fulfill({ status: reviewsStatus, json: { message: 'Server Error' } })
  )
  await page.route(/\/pulls\/3\/comments(\?.*)?$/, (route) =>
    route.fulfill({
      json: [
        {
          id: 21,
          pull_request_review_id: 12,
          user: { login: 'bob' },
          body: '```suggestion\nconst answer = 42\n```',
          path: 'src/answer.ts',
          line: 2,
          position: 2,
          diff_hunk: '@@ -1,2 +1,2 @@\n export {}\n-const answer = 41\n+const answer = 40',
          created_at: '2024-01-03T09:00:00Z'
        },
        {
          id: 22,
          pull_request_review_id: 13,
          in_reply_to_id: 21,
          user: { login: 'octo' },
          body: 'Applied the suggestion.',
          path: 'src/answer.ts',
          line: 2,
          created_at: '2024-01-04T09:00:00Z'
        }
      ]
    })
  )
}

test.describe('pull request activity timeline', () => {
  test('interleaves comments, reviews and suggestions with filters and sorting', async ({
    page
  }) => {
    await mockPull(page)
    await page.goto('/github/octo/timeline/pulls/3')

    const activity = page.getByRole('region', { name: 'Activity' })
    const entries = activity.getByRole('listitem')
    await expect(entries).toHaveCount(4)
    await expect(entries.nth(0)).toContainText('Thanks for opening this.')
    await expect(entries.nth(1)).toContainText('requested changes')
    await expect(entries.nth(2)).toContainText('Addressed the feedback.')
    await expect(entries.nth(3)).toContainText('approved these changes')

    const thread = entries.nth(1).getByRole('region', { name: /Review thread on src\/answer\.ts/ })
    await expect(thread).toContainText('Suggested change')
    await expect(thread).toContainText('const answer = 42')
    await expect(thread).toContainText('Applied the suggestion.')

    await activity.getByRole('combobox', { name: 'Filter activity' }).click()
    await page.getByRole('option', { name: 'Reviews only' }).click()
    await expect(page).toHaveURL(/activity=reviews/)
    await expect(entries).toHaveCount(2)
    await expect(entries.nth(0)).toContainText('requested changes')

    await activity.getByRole('combobox', { name: 'Sort activity' }).click()
    await page.getByRole('option', { name: 'Newest first' }).click()
    await expect(page).toHaveURL(/sort=newest/)
    await expect(entries.nth(0)).toContainText('approved these changes')

    await page.goBack()
    await expect(entries.nth(0)).toContainText('requested changes')

    await page.goto('/github/octo/timeline/pulls/3?activity=comments')
    await expect(entries).toHaveCount(2)
    await expect(entries.nth(1)).toContainText('Addressed the feedback.')

    const results = await new AxeBuilder({ page })
      .include('#pull-activity-heading')
      .include('section[aria-labelledby="pull-activity-heading"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    expect(results.violations).toEqual([])
  })

  test('keeps comments visible and offers a retry when reviews fail', async ({ page }) => {
    await mockPull(page, { reviewsStatus: 500 })
    await page.goto('/github/octo/timeline/pulls/3')

    const activity = page.getByRole('region', { name: 'Activity' })
    await expect(activity.getByText("Couldn't load reviews")).toBeVisible()
    await expect(activity.getByRole('listitem')).toHaveCount(2)
    await expect(activity.getByRole('button', { name: 'Retry' })).toBeVisible()
  })
})

test.describe('pull request details on wide screens', () => {
  test.use({ viewport: { width: 1440, height: 700 } })

  test('sticks beside the description and scrolls away after it', async ({ page }) => {
    const paragraphs = Array.from({ length: 40 }, (_, i) => `Paragraph ${i + 1}.`)
    await mockPull(page, { body: paragraphs.join('\n\n') })
    await page.goto('/github/octo/timeline/pulls/3')

    const details = page.getByRole('complementary', { name: 'Pull request details' })
    await expect(page.getByRole('button', { name: 'Pull request details' })).toBeHidden()
    const reviewers = details.getByRole('region', { name: 'Reviewers' }).getByRole('listitem')
    await expect(reviewers).toHaveText([/bob\s*Requested changes/, /carol\s*Approved/])
    await expect(details.getByRole('region', { name: 'Labels' })).toContainText('enhancement')
    const about = details.getByRole('region', { name: 'About' })
    await expect(about).toContainText('Reviews2')
    await expect(about).toContainText('Approvals1')
    await expect(about).toContainText('Changes requested1')

    await page.getByText('Paragraph 30.').scrollIntoViewIfNeeded()
    await expect(details.getByRole('heading', { name: 'Reviewers' })).toBeInViewport()

    await page
      .getByRole('region', { name: 'Activity' })
      .getByRole('listitem')
      .last()
      .evaluate((el) => el.scrollIntoView({ block: 'end' }))
    await expect(page.getByText('Paragraph 40.')).not.toBeInViewport()
    await expect(details.getByRole('heading', { name: 'About' })).not.toBeInViewport()

    const results = await new AxeBuilder({ page })
      .include('aside[aria-label="Pull request details"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    expect(results.violations).toEqual([])
  })
})

test.describe('pull request details on narrow screens', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('opens from an info button and dismisses with Escape', async ({ page }) => {
    await mockPull(page)
    await page.goto('/github/octo/timeline/pulls/3')

    await expect(page.getByRole('complementary', { name: 'Pull request details' })).toBeHidden()
    const trigger = page.getByRole('button', { name: 'Pull request details' })
    await trigger.click()

    const popover = page.getByRole('dialog')
    await expect(popover.getByRole('region', { name: 'Reviewers' })).toContainText('carol')
    await expect(popover.getByRole('region', { name: 'Labels' })).toContainText('enhancement')

    await page.keyboard.press('Escape')
    await expect(popover).toBeHidden()
    await expect(trigger).toBeFocused()
  })
})
