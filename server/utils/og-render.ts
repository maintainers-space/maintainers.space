// Shared Takumi renderer for every OG image template. A `Renderer` instance
// and its registered fonts are expensive to set up (font parsing) but hold no
// per-request/per-user data, so a single lazily-created instance is reused
// across every render in this server process — unlike the auth-related
// composables elsewhere in this app, this is safe to share across requests.
import { Renderer, type Node } from '@takumi-rs/core'

const OG_WIDTH = 1200
const OG_HEIGHT = 630
export const OG_FONT_FAMILY = 'Geist'

let rendererPromise: Promise<Renderer> | null = null

async function getRenderer(): Promise<Renderer> {
  if (!rendererPromise) {
    rendererPromise = (async () => {
      const renderer = new Renderer()
      const font = await useStorage('assets:server').getItemRaw('fonts:geist-variable.woff2')
      if (font) await renderer.registerFont({ data: font, name: OG_FONT_FAMILY })
      return renderer
    })()
  }
  return rendererPromise
}

/** Render a Takumi node tree to a 1200x630 PNG buffer — the standard OG image size. */
export async function renderOgImage(node: Node): Promise<Buffer> {
  const renderer = await getRenderer()
  return renderer.render(node, { width: OG_WIDTH, height: OG_HEIGHT, format: 'png' })
}
