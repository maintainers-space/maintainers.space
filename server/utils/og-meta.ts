// Text + markup for the `<title>`/`og:*`/`twitter:*` tags every route gets,
// baked into the same SPA-shell HTML every visitor receives (see the
// `render:response` hook in `server/plugins/og-meta.ts`). Kept separate from
// the OG *image* templates (`og-template-*.ts`) since this produces plain
// strings, not a Takumi node tree.
import { userLabel } from '~/utils'
import {
  ogFetchDiscussion,
  ogFetchIssue,
  ogFetchOwnerRepos,
  ogFetchProfile,
  ogFetchPull,
  ogFetchRepo
} from './og-data'
import { FORGE_LABEL } from './og-icons'
import { DEFAULT_TITLE, SITE_TITLE, TAGLINE, titleForPath } from './og-template-page'
import { canonicalOgPath, type OgTarget } from './og-target'

export interface OgMeta {
  title: string
  description: string
}

/**
 * The site's canonical origin, preferring the configured `NUXT_PUBLIC_SITE_URL`
 * over the request's own origin. This matters specifically for `/`, which is
 * prerendered to a static file at build time for the PWA's offline shell —
 * that build-time pass has no real request to read an origin from (Nitro's
 * prerender crawler synthesizes one, e.g. `http://localhost`), so without a
 * configured `siteUrl` its baked-in `og:image`/`og:url` would point at a
 * placeholder host instead of the real deployment. Every other route always
 * has a real request to fall back to. Mirrors the same preference order
 * `app/lib/atproto/attestation.ts` uses for its own trusted-origin check.
 */
export function resolveOgOrigin(siteUrl: string, requestOrigin: string): string {
  if (siteUrl) {
    try {
      return new URL(siteUrl).origin
    } catch {
      /* ignore malformed config */
    }
  }
  return requestOrigin
}

/** Best-effort title/description for a resolved route target — falls back to the generic site pair. */
export async function resolveOgMeta(target: OgTarget): Promise<OgMeta> {
  if (target.kind === 'repo') {
    const data = await ogFetchRepo(target.provider, target.owner, target.repo)
    if (data) {
      return {
        title: `${data.repo.owner}/${data.repo.name}`,
        description: data.repo.description?.trim() || TAGLINE
      }
    }
  } else if (target.kind === 'owner') {
    const repos = await ogFetchOwnerRepos(target.provider, target.owner)
    if (repos) {
      const forgeLabel = FORGE_LABEL[target.provider] ?? target.provider
      const count = `${repos.length} ${repos.length === 1 ? 'repository' : 'repositories'}`
      return { title: target.owner, description: `${count} on ${forgeLabel}` }
    }
  } else if (target.kind === 'profile') {
    const data = await ogFetchProfile(target.handle)
    if (data) {
      return {
        title: data.profile.displayName || data.profile.handle,
        description: data.profile.description?.trim() || TAGLINE
      }
    }
  } else if (target.kind === 'issue' || target.kind === 'pull' || target.kind === 'discussion') {
    const { provider, owner, repo, id, kind } = target
    const data =
      kind === 'issue'
        ? await ogFetchIssue(provider, owner, repo, id)
        : kind === 'pull'
          ? await ogFetchPull(provider, owner, repo, id)
          : await ogFetchDiscussion(provider, owner, repo, id)
    if (data) {
      const parts = [`${owner}/${repo}`]
      if (data.author) parts.push(`by ${userLabel(data.author)}`)
      return { title: data.title, description: parts.join(' · ') }
    }
  }
  const path = target.kind === 'page' ? target.path : ''
  const section = titleForPath(path)
  return {
    title: section === DEFAULT_TITLE ? SITE_TITLE : `${section} · maintainers.space`,
    description: TAGLINE
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/** `<title>` + `og:*`/`twitter:*` `<meta>` tags for one target, ready to splice into `<head>`. */
export function ogMetaTags(
  target: OgTarget,
  meta: OgMeta,
  origin: string,
  pageUrl: string
): string {
  const imageUrl = `${origin}/_og${canonicalOgPath(target)}.png`
  const title = escapeHtml(meta.title)
  const description = escapeHtml(meta.description)
  const image = escapeHtml(imageUrl)
  const url = escapeHtml(pageUrl)
  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:image" content="${image}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${title}">`,
    `<meta name="twitter:description" content="${description}">`,
    `<meta name="twitter:image" content="${image}">`
  ].join('\n')
}
