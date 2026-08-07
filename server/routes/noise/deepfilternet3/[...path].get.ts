// Same-origin DeepFilterNet assets for voice channels.
//
// @colibri-social/client defaults its noise-suppression asset base to
// `/noise/deepfilternet3` on the embedder's own origin, and its AssetLoader
// appends exactly the two paths in DFN_PATHS. Without them that suppression mode
// 404s and falls back to rnnoise, which is inlined in the package and needs no
// network at all, so voice keeps working either way.
export default defineEventHandler(async (event) => {
  const path = getRouterParam(event, 'path')
  if (!path || !DFN_PATHS.includes(path)) {
    throw createError({ statusCode: 400, statusMessage: 'Not a DeepFilterNet asset path.' })
  }
  return await proxyAsset(event, `${DFN_UPSTREAM}/${path}`, CACHE_ASSET)
})
