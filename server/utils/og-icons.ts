// A handful of Lucide glyphs (the same icon set the app's own UI uses via
// `i-lucide-*`), rasterized as inline SVG data URIs since Takumi has no
// concept of an icon font — each body is the verbatim path data from
// `@iconify-json/lucide`, with `currentColor` substituted for a real color
// at render time (a data URI has no CSS cascade to inherit one from).
import { image } from '@takumi-rs/helpers'
import type { Node } from '@takumi-rs/core'

const LUCIDE_ICONS = {
  star: '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.12 2.12 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.12 2.12 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.12 2.12 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.12 2.12 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.12 2.12 0 0 0 1.597-1.16z"/>',
  'git-fork':
    '<circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9m6 3v3"/>',
  'circle-dot': '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="1"/>',
  calendar:
    '<path d="M8 2v4m8-4v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  'message-square':
    '<path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/>',
  'git-pull-request':
    '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7M6 9v12"/>',
  'git-pull-request-closed':
    '<circle cx="6" cy="6" r="3"/><path d="M6 9v12M21 3l-6 6m6 0l-6-6m3 8.5V15"/><circle cx="18" cy="18" r="3"/>',
  'git-merge':
    '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'
} as const

export type OgIconName = keyof typeof LUCIDE_ICONS

function iconDataUri(name: OgIconName, color: string): string {
  const body = LUCIDE_ICONS[name].replaceAll('currentColor', color)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

export function ogIcon(name: OgIconName, size = 22, color = 'white'): Node {
  return image({ src: iconDataUri(name, color), width: size, height: size })
}

/** Display label for a forge id, e.g. `github` -> `GitHub`. */
export const FORGE_LABEL: Record<string, string> = {
  github: 'GitHub',
  gitlab: 'GitLab',
  tangled: 'Tangled',
  codeberg: 'Codeberg',
  gitea: 'Gitea',
  bitbucket: 'Bitbucket'
}
