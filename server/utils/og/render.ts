// Renders a card to PNG with Takumi. The renderer and its fonts hold no per-request data, so one
// instance serves every render in this server process.
import { Renderer } from '@takumi-rs/core'
import { prepareImages } from '@takumi-rs/helpers'
import { extractEmojis } from '@takumi-rs/helpers/emoji'
import { fromHtml } from '@takumi-rs/helpers/html'

import { renderCard, type OgCard } from './cards'
import { OG_HEIGHT, OG_WIDTH } from './cards-size'

const FONTS = ['geist-latin-wght-normal.woff2', 'geist-latin-ext-wght-normal.woff2']

let setup: Promise<Renderer> | undefined

function getRenderer(): Promise<Renderer> {
  setup ??= (async () => {
    const storage = useStorage('assets:server')
    const renderer = new Renderer()
    for (const file of FONTS) {
      const data = await storage.getItemRaw<Uint8Array>(`og:${file}`)
      if (data) await renderer.registerFont({ data, name: 'Geist' })
    }
    return renderer
  })()
  setup.catch(() => {
    setup = undefined
  })
  return setup
}

/** `seed` picks the card's honeycomb; the image path keeps each route's pattern stable. */
export async function renderOgPng(card: OgCard, seed: string): Promise<Buffer> {
  const renderer = await getRenderer()
  const parsed = fromHtml(renderCard(card, { seed }))
  // Emoji in titles become Twemoji images; avatars and emoji are fetched before rendering, and an
  // image that fails or takes too long is left out rather than failing the card.
  const node = extractEmojis(parsed.node, 'twemoji')
  const images = await prepareImages({
    allowUrl: (url) => url.startsWith('https://'),
    maxBytes: 2_000_000,
    node,
    throwOnError: false,
    timeout: 4000
  })
  return renderer.render(node, {
    css: parsed.css,
    format: 'png',
    height: OG_HEIGHT,
    images,
    width: OG_WIDTH
  })
}
