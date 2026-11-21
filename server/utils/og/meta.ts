// The `<title>`, `og:*` and `twitter:*` tags for a route, spliced into the SPA shell's `<head>` by
// `server/plugins/og-meta.ts`. Social crawlers don't run JavaScript, so this is the only place they
// can learn what a page is.
import type { OgCard } from './cards'
import { esc } from './html'
import { describeOgCard, loadOgCard, SITE_NAME } from './load'
import { ogImagePath, type OgTarget } from './target'

/** How long a page waits for card data before using wording derived from the URL. */
const DATA_BUDGET_MS = 1500

function fromUrl(target: OgTarget): { title: string; description: string } {
  const description = `Browse it on ${SITE_NAME}, one place for every forge.`
  switch (target.kind) {
    case 'repo':
      return { description, title: `${target.owner}/${target.repo}` }
    case 'issue':
    case 'pull':
    case 'discussion':
      return { description, title: `${target.owner}/${target.repo}#${target.id}` }
    case 'owner':
      return { description, title: target.owner }
    case 'profile':
      return { description, title: `@${target.handle}` }
    case 'page':
      return { description, title: SITE_NAME }
  }
}

export async function ogMetaTags(
  target: OgTarget,
  origin: string,
  pageUrl: string
): Promise<string> {
  const card = await Promise.race<OgCard | undefined>([
    loadOgCard(target).catch(() => undefined),
    new Promise((resolve) => setTimeout(() => resolve(undefined), DATA_BUDGET_MS))
  ])
  const words = card ? describeOgCard(card) : fromUrl(target)
  const title = words.title === SITE_NAME ? SITE_NAME : `${words.title} · ${SITE_NAME}`
  const image = `${origin}${ogImagePath(target)}`
  const alt = card?.kind === 'page' ? `${SITE_NAME}: ${words.title}` : words.title

  const tags: Array<[attribute: 'name' | 'property', key: string, value: string]> = [
    ['name', 'description', words.description],
    ['property', 'og:site_name', SITE_NAME],
    ['property', 'og:type', 'website'],
    ['property', 'og:title', words.title],
    ['property', 'og:description', words.description],
    ['property', 'og:url', pageUrl],
    ['property', 'og:image', image],
    ['property', 'og:image:type', 'image/png'],
    ['property', 'og:image:width', '1200'],
    ['property', 'og:image:height', '630'],
    ['property', 'og:image:alt', alt],
    ['name', 'twitter:card', 'summary_large_image'],
    ['name', 'twitter:title', words.title],
    ['name', 'twitter:description', words.description],
    ['name', 'twitter:image', image]
  ]
  return [
    `<title>${esc(title)}</title>`,
    ...tags.map(([attr, key, value]) => `<meta ${attr}="${key}" content="${esc(value)}">`)
  ].join('\n')
}
