import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', (route) => route.abort())
})

test.describe('anonymous visitor', () => {
  test('can browse the home page and open search', async ({ page }) => {
    await page.goto('/')

    await expect(page).toHaveTitle(/maintainers\.space/)
    await expect(page.getByRole('heading', { name: 'One place for every forge.' })).toBeVisible()

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
    await page.getByRole('button', { name: 'bsky.social' }).click()
    await expect(page.getByLabel('Handle or DID')).toHaveValue('you.bsky.social')
  })

  test('publishes privacy and terms information', async ({ page }) => {
    await page.goto('/privacy')
    await expect(page.getByRole('heading', { name: 'Your identity' })).toBeVisible()

    await page.goto('/terms')
    await expect(page.getByRole('heading', { name: 'The software' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Privacy' })).toBeVisible()
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
