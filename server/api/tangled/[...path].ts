/**
 * Same-origin proxy for Tangled's XRPC aggregator ("Bobbin").
 *
 * `api.tangled.org` returns no CORS headers, so the browser blocks every direct
 * request to it ("NetworkError"/"Repository not found"). Proxying it through
 * Nitro makes all of Tangled's read APIs work from the client.
 *
 * `GET /api/tangled/<nsid>?<query>` -> `https://api.tangled.org/xrpc/<nsid>?<query>`
 */
export default defineEventHandler(async (event) => {
  const path = getRouterParam(event, 'path')
  if (!path) throw createError({ statusCode: 400, statusMessage: 'Missing Tangled XRPC method' })
  return await proxyJson(event, `https://api.tangled.org/xrpc/${path}`, policyForNsid(path))
})
