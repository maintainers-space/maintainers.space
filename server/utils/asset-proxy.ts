import type { H3Event } from 'h3'
import type { CachePolicy } from './cache'

/**
 * Same-origin passthrough for a third-party static asset.
 *
 * @colibri-social/client asks for its emoji images and DeepFilterNet model from
 * the embedder's own origin rather than a CDN, so the browser never talks to a
 * third party for them. That only holds if the caller validates `url` against a
 * fixed allowlist first: a catch-all route that forwards an attacker-controlled
 * path is an open proxy, and one that forwards a whole URL is an SSRF.
 *
 * The body is streamed rather than buffered, because the DeepFilterNet wasm is
 * around 16 MB and reading it into memory per request would be the wrong shape
 * even though the edge absorbs almost every hit.
 *
 * `Range` is forwarded, which is not decorative: the client validates the model
 * by asking for `bytes=0-1` and checking the gzip magic number, so swallowing the
 * header would turn a 2-byte check into a 7.6 MB download on every voice join.
 */
export async function proxyAsset(event: H3Event, url: string, policy: CachePolicy): Promise<void> {
  const range = getRequestHeader(event, 'range')

  let res: Response
  try {
    res = await fetch(url, { headers: range ? { range } : undefined })
  } catch (e) {
    throw createError({
      statusCode: 502,
      statusMessage: `Could not reach the asset host: ${e instanceof Error ? e.message : String(e)}`
    })
  }

  if (!res.ok || !res.body) {
    throw createError({
      statusCode: res.status === 404 ? 404 : 502,
      statusMessage: `Asset host answered ${res.status} for ${url}`
    })
  }

  setCacheHeaders(event, policy)
  setResponseStatus(event, res.status)
  const type = res.headers.get('content-type')
  if (type) setResponseHeader(event, 'Content-Type', type)
  for (const h of ['content-range', 'accept-ranges'] as const) {
    const v = res.headers.get(h)
    if (v) setResponseHeader(event, h, v)
  }
  // Forwarded so a client can show real progress on the ~16MB wasm rather than
  // reading a chunked response of unknown length.
  const length = Number(res.headers.get('content-length'))
  if (Number.isFinite(length) && length > 0) setResponseHeader(event, 'Content-Length', length)

  return await sendStream(event, res.body)
}
