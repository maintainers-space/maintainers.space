// Serves real, server-computed `<title>`/`og:*`/`twitter:*` meta tags to
// known social-preview crawlers, and only to them — every other request
// (i.e. every real visitor, on every route, always) falls straight through
// to the unmodified `ssr: false` SPA and its PWA/offline shell. Crawlers
// never execute JavaScript, so the client-only `useSeoMeta()` calls in
// `app/app.vue` are otherwise invisible to them; this is the only mechanism
// that makes link previews (Slack, Discord, Twitter/X, Bluesky, ...) work at
// all, since the app has no other server-rendered pass for any route.
import { userLabel } from '~/utils'
import { CACHE_MEDIUM, setCacheHeaders } from '../utils/cache'
import {
  ogFetchDiscussion,
  ogFetchIssue,
  ogFetchOwnerRepos,
  ogFetchProfile,
  ogFetchPull,
  ogFetchRepo
} from '../utils/og-data'
import { FORGE_LABEL } from '../utils/og-icons'
import { DEFAULT_TITLE, SITE_TITLE, TAGLINE, titleForPath } from '../utils/og-template-page'
import { canonicalOgPath, resolveOgTarget, type OgTarget } from '../utils/og-target'

const BOT_USER_AGENT =
  /Slackbot|Twitterbot|Discordbot|facebookexternalhit|LinkedInBot|TelegramBot|WhatsApp|Googlebot|Applebot|redditbot|Pinterest|SkypeUriPreview|Bluesky|Cardyb/i

interface OgMeta {
  title: string
  description: string
}

async function resolveOgMeta(target: OgTarget): Promise<OgMeta> {
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

export default defineEventHandler(async (event) => {
  const userAgent = getRequestHeader(event, 'user-agent') ?? ''
  if (!BOT_USER_AGENT.test(userAgent)) return

  const url = getRequestURL(event)
  if (url.pathname.startsWith('/_og/') || url.pathname.startsWith('/api/')) return

  const target = resolveOgTarget(url.pathname)
  // A repo/owner/profile/issue/pull/discussion target is unambiguous by
  // construction (a validated forge id, or the literal `/profile/` prefix) —
  // only the generic 'page' fallback needs to guard against intercepting a
  // static asset request (build chunks, the PWA manifest/service worker,
  // favicons, ...), since those share its "anything else" bucket. A dot only
  // means "asset" there — atproto handles and repo names routinely contain
  // one too (e.g. `bsky.app`), which is why the other kinds skip this check.
  if (target.kind === 'page' && /\.[^/]+$/.test(url.pathname)) return

  const meta = await resolveOgMeta(target)
  const imageUrl = `${url.origin}/_og${canonicalOgPath(target)}.png`

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(meta.title)}</title>
<meta name="description" content="${escapeHtml(meta.description)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(meta.title)}">
<meta property="og:description" content="${escapeHtml(meta.description)}">
<meta property="og:image" content="${escapeHtml(imageUrl)}">
<meta property="og:url" content="${escapeHtml(url.href)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(meta.title)}">
<meta name="twitter:description" content="${escapeHtml(meta.description)}">
<meta name="twitter:image" content="${escapeHtml(imageUrl)}">
</head>
<body></body>
</html>
`

  setResponseHeader(event, 'Content-Type', 'text/html; charset=utf-8')
  setCacheHeaders(event, CACHE_MEDIUM)
  return html
})
