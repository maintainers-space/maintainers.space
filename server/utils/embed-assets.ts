// Upstream sources and path allowlists for the third-party static assets
// @colibri-social/client expects the embedder to serve from its own origin.
//
// Kept out of the route files so they can be unit tested: importing a route
// module executes Nitro's auto-imported `defineEventHandler`, which does not
// exist under vitest.

/**
 * Must match the version @twemoji/api itself defaults to, since that is the
 * asset set the embed's codepoint generation was built against. Asserted against
 * the installed package in embed-assets.test.ts, so upgrading the embed cannot
 * silently repoint the emoji set.
 */
export const TWEMOJI_VERSION = '17.0.3'

export const TWEMOJI_UPSTREAM = `https://cdn.jsdelivr.net/gh/jdecked/twemoji@${TWEMOJI_VERSION}/assets`

/**
 * A codepoint filename: lowercase hex groups joined by `-`, as produced by
 * twemoji's `convert.toCodePoint` for ZWJ and flag sequences. Anchored, so it
 * also rejects traversal and any attempt to use the route as an open proxy.
 */
export const TWEMOJI_PATH =
  /^(72x72\/[0-9a-f]+(-[0-9a-f]+)*\.png|svg\/[0-9a-f]+(-[0-9a-f]+)*\.svg)$/

/**
 * The only published source for the DeepFilterNet model. It is not on npm and
 * the package ships no binaries, so this is a deliberate third-party dependency,
 * which is worth knowing for the privacy page even though the browser only ever
 * sees this origin.
 */
export const DFN_UPSTREAM = 'https://cdn.mezon.ai/AI/models/datas/noise_suppression/deepfilternet3'

/**
 * Exactly what `getAssetLoader().getAssetUrls()` requests, as an allowlist rather
 * than a pattern. There are only two, so anything else is a bug or an attempt to
 * use the route as an open proxy.
 */
export const DFN_PATHS = ['v3/pkg/df_bg.wasm', 'v3/models/DeepFilterNet3_onnx.tar.gz']
