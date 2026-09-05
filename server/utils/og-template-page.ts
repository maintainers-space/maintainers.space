// The generic branded card for every route that isn't a repo/owner/profile/
// issue/pull/discussion (home, explore, search, timeline, settings, ...), and
// the fallback whenever a more specific template's data fetch comes back empty.
import { container, text } from '@takumi-rs/helpers'
import type { Node } from '@takumi-rs/core'
import { ogBrand } from './og-brand'
import { ogFrame } from './og-frame'
import { OG_FONT_FAMILY } from './og-render'

export const SECTION_TITLE: Record<string, string> = {
  explore: 'Explore',
  search: 'Search',
  timeline: 'Timeline',
  settings: 'Settings',
  login: 'Sign in',
  notifications: 'Notifications',
  privacy: 'Privacy Policy',
  terms: 'Terms of Service'
}

export const DEFAULT_TITLE = 'maintainers.space'
/** Matches `app/app.vue`'s own `title`/`description` — the real site's canonical pair. */
export const SITE_TITLE = 'maintainers.space — one place for every forge'
export const TAGLINE =
  'Browse repositories across GitHub and Tangled, and link your forge accounts to your AT Protocol identity.'

export function titleForPath(path: string): string {
  const first = path.split('/').filter(Boolean)[0]
  return (first && SECTION_TITLE[first]) || DEFAULT_TITLE
}

export function ogPageTemplate(path: string): Node {
  const title = titleForPath(path)
  return ogFrame([
    container({
      tw: 'flex h-full w-full flex-col justify-between p-20',
      style: {},
      children: [
        ogBrand({ size: 48 }),
        container({
          tw: 'flex flex-col',
          style: { gap: '24px', maxWidth: '860px' },
          children: [
            text(title, {
              fontFamily: OG_FONT_FAMILY,
              fontSize: 80,
              fontWeight: 700,
              color: 'white',
              letterSpacing: '-0.02em'
            }),
            text(TAGLINE, {
              fontFamily: OG_FONT_FAMILY,
              fontSize: 32,
              fontWeight: 400,
              color: 'rgba(255,255,255,0.7)'
            })
          ]
        })
      ]
    })
  ])
}
