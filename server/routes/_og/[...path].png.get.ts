// Renders the OG image for any app route as a PNG. Route params here are
// unreliable for a catch-all with a fixed `.png` suffix (Nitro folds the
// suffix into the param's key rather than stripping it), so the target path
// is derived directly from the request URL instead.
import { CACHE_MEDIUM, setCacheHeaders } from '../../utils/cache'
import { ogFetchOwnerRepos, ogFetchProfile, ogFetchRepo } from '../../utils/og-data'
import { renderOgImage } from '../../utils/og-render'
import { ogPageTemplate } from '../../utils/og-template-page'
import { ogOwnerTemplate } from '../../utils/og-template-owner'
import { ogProfileTemplate } from '../../utils/og-template-profile'
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
  } else if (target.kind === 'owner') {
    const repos = await ogFetchOwnerRepos(target.provider, target.owner)
    if (repos) return ogOwnerTemplate({ provider: target.provider, owner: target.owner, repos })
  } else if (target.kind === 'profile') {
    const data = await ogFetchProfile(target.handle)
    if (data) return ogProfileTemplate(data)
  }
  // Every other target kind — and a fetch that came back empty — renders the
  // generic branded card for now; the richer Issue/PR/Discussion template
  // plugs into this dispatch as it's built.
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
