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

test.describe('dependency updates page', () => {
  test('prompts anonymous visitors to sign in, accessibly', async ({ page }) => {
    await page.goto('/notifications/dependencies')

    await expect(page.getByRole('heading', { name: 'Dependency updates' })).toBeVisible()
    await expect(
      page.getByRole('paragraph').filter({ hasText: 'Sign in to aggregate dependency updates' })
    ).toBeVisible()

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    expect(results.violations).toEqual([])
  })
})
