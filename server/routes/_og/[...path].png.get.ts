// Renders the OG image for any app route as a PNG. Route params here are
// unreliable for a catch-all with a fixed `.png` suffix (Nitro folds the
// suffix into the param's key rather than stripping it), so the target path
// is derived directly from the request URL instead.
import { CACHE_MEDIUM, setCacheHeaders } from '../../utils/cache'
import { ogFetchRepo } from '../../utils/og-data'
import { renderOgImage } from '../../utils/og-render'
import { ogPageTemplate } from '../../utils/og-template-page'
import { ogRepoTemplate } from '../../utils/og-template-repo'
import { resolveOgTarget } from '../../utils/og-target'
import type { Node } from '@takumi-rs/core'

async function resolveNode(
  target: ReturnType<typeof resolveOgTarget>,
  path: string
): Promise<Node> {
  if (target.kind === 'repo') {
    const data = await ogFetchRepo(target.provider, target.owner, target.repo)
    if (data) return ogRepoTemplate(data)
  }
  // Every other target kind — and a repo whose data fetch came back empty —
  // renders the generic branded card for now; richer per-kind templates
  // (owner, profile, issue/pull/discussion) plug into this dispatch as
  // they're built.
  return ogPageTemplate(target.kind === 'page' ? target.path : path)
}

export default defineEventHandler(async (event) => {
  const pathname = getRequestURL(event).pathname
  const path = pathname.replace(/^\/_og\//, '').replace(/\.png$/, '')
  const target = resolveOgTarget(path)

  const node = await resolveNode(target, path)
  const png = await renderOgImage(node)

  setResponseHeader(event, 'Content-Type', 'image/png')
  setCacheHeaders(event, CACHE_MEDIUM)
  return png
})
