// Bakes real `<title>`/`og:*`/`twitter:*` meta tags into the same SPA-shell
// HTML every visitor receives — no user-agent sniffing, so there's no bot
// list to maintain and nothing to ever miss. Only `<head>` is touched (a
// plain string splice before `</head>`); the `<body>`, scripts, and the
// `#__nuxt` mount point are untouched, so real visitors get byte-identical
// hydration and the PWA/offline shell keeps working exactly as before —
// `useSeoMeta()` in `app/app.vue` recognizes and takes over these same tags
// once it hydrates, rather than duplicating them.
import { ogMetaTags, resolveOgMeta, resolveOgOrigin } from '../utils/og-meta'
import { resolveOgTarget } from '../utils/og-target'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:response', async (response, { event }) => {
    if (typeof response.body !== 'string' || !response.body.includes('</head>')) return

    const url = getRequestURL(event)
    const target = resolveOgTarget(url.pathname)
    // A repo/owner/profile/issue/pull/discussion target is unambiguous by
    // construction (a validated forge id, or the literal `/profile/`
    // prefix) — only the generic 'page' fallback needs to guard against a
    // stray static-asset-shaped path reaching here. A dot only means
    // "asset" there — atproto handles and repo names routinely contain one
    // too (e.g. `bsky.app`), which is why the other kinds skip this check.
    if (target.kind === 'page' && /\.[^/]+$/.test(url.pathname)) return

    const meta = await resolveOgMeta(target)
    const origin = resolveOgOrigin(useRuntimeConfig(event).public.siteUrl, url.origin)
    const pageUrl = `${origin}${url.pathname}${url.search}`
    const tags = ogMetaTags(target, meta, origin, pageUrl)
    response.body = response.body.replace('</head>', `${tags}\n</head>`)
  })
})
