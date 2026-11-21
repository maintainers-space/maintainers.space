import { expect, test } from '@playwright/test'

// Crawlers don't run JavaScript, so these read the HTML and images the server sends.
test.describe('social previews', () => {
  test('pages carry their own preview tags', async ({ request }) => {
    const html = await (await request.get('/github/nuxt/nuxt/pulls/37171')).text()

    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">')
    expect(html).toMatch(
      /<meta property="og:image" content="https?:\/\/[^"]+\/_og\/github\/nuxt\/nuxt\/pulls\/37171\.png">/
    )
    expect(html.match(/<title>/g)).toHaveLength(1)
  })

  test('preview images are PNGs the edge can keep', async ({ request }) => {
    const response = await request.get('/_og/search.png')

    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toBe('image/png')
    expect(response.headers()['netlify-cdn-cache-control']).toContain('durable')
    const png = await response.body()
    expect([...png.subarray(1, 4)].map((b) => String.fromCharCode(b)).join('')).toBe('PNG')
  })
})
