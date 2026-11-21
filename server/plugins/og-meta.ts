// Adds a route's `<title>` and social preview tags to the SPA shell every visitor receives. Only
// `<head>` changes; the body and scripts stay byte-identical, so hydration and the offline shell
// work as before. No user-agent sniffing, so no crawler is ever missed.
import { ogMetaTags } from '../utils/og/meta'
import { resolveOgTarget } from '../utils/og/target'

const PRODUCTION_ORIGIN = 'https://maintainers.space'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:response', async (response, { event }) => {
    if (typeof response.body !== 'string' || !response.body.includes('</head>')) return
    const url = getRequestURL(event)
    // Prerendering (the offline shell at `/`) has no real request origin to point the image at.
    const origin =
      useRuntimeConfig(event).public.siteUrl ||
      (import.meta.prerender ? PRODUCTION_ORIGIN : url.origin)
    const tags = await ogMetaTags(resolveOgTarget(url.pathname), origin, `${origin}${url.pathname}`)
    response.body = response.body.replace('</head>', `${tags}\n</head>`)
  })
})
