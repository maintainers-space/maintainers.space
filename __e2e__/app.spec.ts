import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', (route) => route.abort())
})

test.describe('anonymous visitor', () => {
  test('can browse the home page and open search', async ({ page }) => {
    await page.goto('/')

    await expect(page).toHaveTitle(/maintainers\.space/)
    await expect(page.getByRole('heading', { name: 'One place for every forge.' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Explore', exact: true })).toHaveCount(0)

    await page.getByRole('link', { name: 'Search', exact: true }).first().click()
    await expect(page).toHaveURL(/\/search$/)
    await expect(page.getByRole('heading', { name: 'Search' })).toBeVisible()
  })

  test('can fill the repository browser', async ({ page }) => {
    await page.goto('/')

    await page.getByLabel('Owner').fill('nuxt')
    await page.getByLabel('Repository').fill('nuxt')
    await page.getByRole('button', { name: 'View' }).click()

    await expect(page).toHaveURL(/\/github\/nuxt\/nuxt$/)
  })

  test('can use a suggested sign-in handle', async ({ page }) => {
    await page.goto('/login')

    await expect(page.getByRole('heading', { name: 'Sign in with atproto' })).toBeVisible()
    await page.getByRole('button', { name: 'eurosky.social' }).click()
    await expect(page.getByLabel('Handle or DID')).toHaveValue('you.eurosky.social')
    await expect(page.getByRole('link', { name: 'Privacy' })).toBeVisible()
  })

  test('publishes privacy and terms information and cross-links them', async ({ page }) => {
    await page.goto('/privacy')
    await expect(page.getByRole('heading', { name: 'Your identity' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Cookies' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Terms of Service' })).toBeVisible()

    await page.goto('/terms')
    await expect(page.getByRole('heading', { name: 'The software' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Contact' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Privacy Policy' }).first()).toBeVisible()
  })

  test('limits crawlers to stable public pages', async ({ request }) => {
    const robots = await request.get('/robots.txt')
    const robotsBody = await robots.text()

    expect(robots.ok()).toBe(true)
    expect(robotsBody).toContain('Disallow: /api/')
    expect(robotsBody).toContain('Disallow: /profile/')
    expect(robotsBody).toContain('Sitemap: https://maintainers.space/sitemap.xml')

    const privatePage = await request.get('/login')
    expect(privatePage.headers()['x-robots-tag']).toBe('noindex, nofollow')

    const sitemap = await request.get('/sitemap.xml')
    expect(await sitemap.text()).toContain('<loc>https://maintainers.space/</loc>')
  })
})

test.describe('GitHub Markdown alerts', () => {
  test('renders alerts in an issue and its comments', async ({ page }) => {
    await page.route('https://api.github.com/repos/octo/alerts', (route) =>
      route.fulfill({
        json: {
          owner: { login: 'octo' },
          name: 'alerts',
          full_name: 'octo/alerts',
          default_branch: 'main',
          html_url: 'https://github.com/octo/alerts',
          has_issues: true
        }
      })
    )
    await page.route('https://api.github.com/repos/octo/alerts/issues/7', (route) =>
      route.fulfill({
        json: {
          number: 7,
          title: 'Alert rendering',
          state: 'open',
          user: { login: 'octo' },
          body: [
            '> [!NOTE]',
            '> This issue uses a GitHub Markdown alert.',
            '',
            '> [!IMPORTANT]',
            '> Important alerts retain Markdown formatting.',
            '',
            '> [!WARNING]',
            '> Warning alerts are supported too.',
            '',
            '> [!CAUTION]',
            '> Caution alerts are also supported.'
          ].join('\n'),
          comments: 1,
          html_url: 'https://github.com/octo/alerts/issues/7'
        }
      })
    )
    await page.route(
      /^https:\/\/api\.github\.com\/repos\/octo\/alerts\/issues\/7\/comments(?:\?.*)?$/,
      (route) =>
        route.fulfill({
          json: [
            {
              id: 1,
              user: { login: 'hubot' },
              body: '> [!TIP]\n> Alerts also work in comments.'
            }
          ]
        })
    )

    await page.goto('/github/octo/alerts/issues/7')

    const alerts = page.locator('.github-markdown-alert')
    await expect(alerts).toHaveCount(5)
    await expect(alerts.nth(0)).toHaveAttribute('data-github-alert', 'note')
    await expect(alerts.nth(0)).toContainText('Note')
    await expect(alerts.nth(0)).toContainText('This issue uses a GitHub Markdown alert.')
    await expect(alerts.nth(1)).toHaveAttribute('data-github-alert', 'important')
    await expect(alerts.nth(2)).toHaveAttribute('data-github-alert', 'warning')
    await expect(alerts.nth(3)).toHaveAttribute('data-github-alert', 'caution')
    await expect(alerts.nth(4)).toHaveAttribute('data-github-alert', 'tip')
    await expect(alerts.nth(4)).toContainText('Tip')
    await expect(alerts.nth(4)).toContainText('Alerts also work in comments.')

    const results = await new AxeBuilder({ page })
      .include('.github-markdown-alert')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    expect(results.violations).toEqual([])
  })
})

test.describe('pull request conversation timeline', () => {
  // Route the GitHub endpoints the PR page touches. GitHub detail/list endpoints
  // carry query strings, so list endpoints match by regex.
  async function stubChronoApi(page) {
    await page.route('https://api.github.com/repos/octo/chrono', (route) =>
      route.fulfill({
        json: {
          owner: { login: 'octo' },
          name: 'chrono',
          full_name: 'octo/chrono',
          default_branch: 'main',
          html_url: 'https://github.com/octo/chrono',
          has_issues: true
        }
      })
    )
    await page.route('https://api.github.com/repos/octo/chrono/pulls/7', (route) =>
      route.fulfill({
        json: {
          number: 7,
          title: 'Chronological conversation',
          state: 'open',
          merged: false,
          draft: false,
          user: { login: 'octo' },
          body: 'The pull request body.',
          head: { ref: 'feature' },
          base: { ref: 'main' },
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-04T00:00:00Z',
          html_url: 'https://github.com/octo/chrono/pull/7',
          additions: 1,
          deletions: 0,
          changed_files: 1,
          commits: 1
        }
      })
    )
    // Two comments around one review — out of chronological order if shown as
    // `comments, then reviews`.
    await page.route(
      /^https:\/\/api\.github\.com\/repos\/octo\/chrono\/issues\/7\/comments(?:\?.*)?$/,
      (route) =>
        route.fulfill({
          json: [
            {
              id: 1,
              user: { login: 'alice' },
              body: 'first comment',
              created_at: '2024-01-02T00:00:00Z'
            },
            {
              id: 2,
              user: { login: 'carol' },
              body: 'last comment',
              created_at: '2024-01-04T00:00:00Z'
            }
          ]
        })
    )
    await page.route(
      /^https:\/\/api\.github\.com\/repos\/octo\/chrono\/pulls\/7\/reviews(?:\?.*)?$/,
      (route) =>
        route.fulfill({
          json: [
            {
              id: 12,
              user: { login: 'bob' },
              body: 'LGTM',
              state: 'APPROVED',
              submitted_at: '2024-01-03T00:00:00Z',
              html_url: 'https://github.com/octo/chrono/pull/7#pullrequestreview-12'
            }
          ]
        })
    )
    await page.route(
      /^https:\/\/api\.github\.com\/repos\/octo\/chrono\/pulls\/7\/reviews\/12\/comments(?:\?.*)?$/,
      (route) => route.fulfill({ json: [] })
    )
    await page.route(
      /^https:\/\/api\.github\.com\/repos\/octo\/chrono\/pulls\/7\/files(?:\?.*)?$/,
      (route) => route.fulfill({ json: [] })
    )
    await page.route(
      /^https:\/\/api\.github\.com\/repos\/octo\/chrono\/pulls\/7\/commits(?:\?.*)?$/,
      (route) => route.fulfill({ json: [] })
    )
  }

  test('interleaves comments and reviews chronologically', async ({ page }) => {
    await stubChronoApi(page)
    await page.goto('/github/octo/chrono/pulls/7')

    const timeline = page.locator('ol[aria-label*="conversation events"]')
    await expect(timeline).toBeVisible()
    // The review summary is fetched with the first page of reviews on load.
    await expect(timeline.getByText('approved these changes')).toBeVisible({ timeout: 10_000 })
    // First event is the earlier comment, then the review (submitted in between),
    // then the later comment — chronological order, not comments-then-reviews.
    await expect(timeline.locator('li').nth(0)).toContainText('first comment')
    await expect(timeline.locator('li').nth(1)).toContainText('approved these changes')
    await expect(timeline.locator('li').nth(1)).toContainText('bob')
    await expect(timeline.locator('li').nth(2)).toContainText('last comment')

    // The metadata rail surfaces the reviewer and the branch comparison.
    const rail = page.locator('[aria-label="Pull request metadata"]')
    await expect(rail).toContainText('Reviewers')
    await expect(rail).toContainText('bob')
    await expect(rail).toContainText('feature → main')
  })

  test('collapses metadata behind the Details button on narrow screens', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await stubChronoApi(page)
    await page.goto('/github/octo/chrono/pulls/7')

    const rail = page.locator('[aria-label="Pull request metadata"]')
    await expect(rail).toBeHidden()

    await page.getByRole('button', { name: 'Details' }).click()
    await expect(rail).toBeVisible()
    await expect(rail).toContainText('feature → main')
  })
})
