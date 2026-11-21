// `GET /_og/<route>.png`: the social preview image for an app route, rendered on demand and kept
// at the edge (see CACHE_OG), so each image is drawn about once a day however often it's shared.
import { CACHE_OG, setCacheHeaders } from '../../utils/cache'
import { loadOgCard } from '../../utils/og/load'
import { renderOgPng } from '../../utils/og/render'
import { resolveOgTarget } from '../../utils/og/target'

export default defineEventHandler(async (event) => {
  const { pathname } = getRequestURL(event)
  if (!pathname.endsWith('.png')) {
    throw createError({ statusCode: 404, statusMessage: 'Preview images end in .png.' })
  }
  const route = pathname.replace(/^\/_og/, '').replace(/\.png$/, '')
  const target = resolveOgTarget(route === '/index' ? '/' : route)
  const png = await renderOgPng(await loadOgCard(target))

  setResponseHeader(event, 'Content-Type', 'image/png')
  setCacheHeaders(event, CACHE_OG)
  return png
})
