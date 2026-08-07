// Same-origin emoji images for the Chat tab.
//
// @colibri-social/client sets `twemoji.base = "/twemoji/"` and leaves twemoji's
// own `size`/`ext` defaults alone, so the embed requests
// `/twemoji/72x72/<codepoint>.png` from this origin. Serving it here means the
// browser never reaches jsDelivr for emoji, which is otherwise a third-party
// request on every message render.
export default defineEventHandler(async (event) => {
  const path = getRouterParam(event, 'path')
  if (!path || !TWEMOJI_PATH.test(path)) {
    throw createError({ statusCode: 400, statusMessage: 'Not a twemoji asset path.' })
  }
  return await proxyAsset(event, `${TWEMOJI_UPSTREAM}/${path}`, CACHE_ASSET)
})
