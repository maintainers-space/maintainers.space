// Renders the OG image for any app route as a PNG. Route params here are
// unreliable for a catch-all with a fixed `.png` suffix (Nitro folds the
// suffix into the param's key rather than stripping it), so the target path
// is derived directly from the request URL instead.
import { CACHE_MEDIUM, setCacheHeaders } from '../../utils/cache'
import { renderOgImage } from '../../utils/og-render'
import { ogPageTemplate } from '../../utils/og-template-page'
import { resolveOgTarget } from '../../utils/og-target'

export default defineEventHandler(async (event) => {
  const pathname = getRequestURL(event).pathname
  const path = pathname.replace(/^\/_og\//, '').replace(/\.png$/, '')
  const target = resolveOgTarget(path)

  // Every target kind renders the generic branded card for now; richer
  // per-kind templates (repo, owner, profile, issue/pull/discussion) plug into
  // this dispatch as they're built.
  const node = ogPageTemplate(target.kind === 'page' ? target.path : path)
  const png = await renderOgImage(node)

  setResponseHeader(event, 'Content-Type', 'image/png')
  setCacheHeaders(event, CACHE_MEDIUM)
  return png
})
