// The flagship OG image: forge badge, owner/repo title, description, topic
// pills and a GitHub-style stat row on the left; a tangled.org-style circular
// per-language distribution ring (or a single color dot + name when the forge
// only reports one top language) on the right.
import { container, text } from '@takumi-rs/helpers'
import type { Node } from '@takumi-rs/core'
import { formatCompactNumber, formatRelativeTime } from '~/utils'
import type { OgRepoData } from './og-data'
import { ogBrand } from './og-brand'
import { ogFrame } from './og-frame'
import { ogIcon, type OgIconName } from './og-icons'
import { languageColor } from './og-language-colors'
import { buildLanguageRing, ringConicGradient } from './og-language-ring'
import { OG_FONT_FAMILY } from './og-render'

const DARK_BG = '#1b1718'

const FORGE_LABEL: Record<string, string> = {
  github: 'GitHub',
  gitlab: 'GitLab',
  tangled: 'Tangled',
  codeberg: 'Codeberg',
  gitea: 'Gitea',
  bitbucket: 'Bitbucket'
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value
  return `${value.slice(0, max - 1).trimEnd()}…`
}

function statItem(icon: OgIconName, label: string): Node {
  return container({
    tw: 'flex items-center',
    style: { gap: '10px' },
    children: [
      ogIcon(icon, 24, 'rgba(255,255,255,0.55)'),
      text(label, { fontFamily: OG_FONT_FAMILY, fontSize: 26, color: 'rgba(255,255,255,0.8)' })
    ]
  })
}

/** The tangled.org-style ring, or a single color dot + name when only one top language is known. */
function languageVisual(
  languages: Record<string, number> | undefined,
  fallbackLanguage?: string | null
): Node | null {
  const segments = languages ? buildLanguageRing(languages) : []
  if (!segments.length) {
    if (!fallbackLanguage) return null
    return container({
      tw: 'flex items-center',
      style: { gap: '12px' },
      children: [
        container({
          tw: 'rounded-full',
          style: {
            width: '18px',
            height: '18px',
            backgroundColor: languageColor(fallbackLanguage)
          },
          children: []
        }),
        text(fallbackLanguage, { fontFamily: OG_FONT_FAMILY, fontSize: 28, color: 'white' })
      ]
    })
  }

  const top = segments[0]!
  const size = 220
  const hole = 132
  return container({
    tw: 'flex items-center justify-center',
    style: {
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: '50%',
      backgroundImage: ringConicGradient(segments)
    },
    children: [
      container({
        tw: 'flex flex-col items-center justify-center',
        style: {
          width: `${hole}px`,
          height: `${hole}px`,
          borderRadius: '50%',
          backgroundColor: DARK_BG
        },
        children: [
          text(top.name, {
            fontFamily: OG_FONT_FAMILY,
            fontSize: 24,
            fontWeight: 600,
            color: 'white'
          }),
          text(`${Math.round(top.percent)}%`, {
            fontFamily: OG_FONT_FAMILY,
            fontSize: 19,
            color: 'rgba(255,255,255,0.6)'
          })
        ]
      })
    ]
  })
}

export function ogRepoTemplate({ repo, languages }: OgRepoData): Node {
  const forgeLabel = FORGE_LABEL[repo.provider] ?? repo.provider

  const topLeft: Node[] = [
    container({
      tw: 'flex items-center rounded-full',
      style: {
        alignSelf: 'flex-start',
        padding: '8px 20px',
        backgroundColor: 'rgba(255,255,255,0.08)'
      },
      children: [
        text(forgeLabel, {
          fontFamily: OG_FONT_FAMILY,
          fontSize: 24,
          fontWeight: 600,
          color: 'rgba(255,255,255,0.8)'
        })
      ]
    }),
    container({
      tw: 'flex items-center',
      style: { gap: '12px' },
      children: [
        text(repo.owner, {
          fontFamily: OG_FONT_FAMILY,
          fontSize: 58,
          fontWeight: 500,
          color: 'rgba(255,255,255,0.5)'
        }),
        text('/', {
          fontFamily: OG_FONT_FAMILY,
          fontSize: 58,
          fontWeight: 500,
          color: 'rgba(255,255,255,0.3)'
        }),
        text(repo.name, {
          fontFamily: OG_FONT_FAMILY,
          fontSize: 58,
          fontWeight: 700,
          color: 'white'
        })
      ]
    })
  ]
  if (repo.description) {
    topLeft.push(
      text(truncate(repo.description, 130), {
        fontFamily: OG_FONT_FAMILY,
        fontSize: 30,
        color: 'rgba(255,255,255,0.7)'
      })
    )
  }
  const topics = (repo.topics ?? []).slice(0, 4)
  if (topics.length) {
    topLeft.push(
      container({
        tw: 'flex flex-row flex-wrap',
        style: { gap: '10px' },
        children: topics.map((t) =>
          container({
            tw: 'flex items-center rounded-full',
            style: { padding: '7px 18px', backgroundColor: 'rgba(234,179,8,0.15)' },
            children: [text(t, { fontFamily: OG_FONT_FAMILY, fontSize: 21, color: '#eab308' })]
          })
        )
      })
    )
  }

  const stats = [
    repo.stars !== undefined ? statItem('star', formatCompactNumber(repo.stars)) : null,
    repo.forks !== undefined ? statItem('git-fork', formatCompactNumber(repo.forks)) : null,
    repo.issues !== undefined ? statItem('circle-dot', formatCompactNumber(repo.issues)) : null,
    repo.updatedAt ? statItem('calendar', formatRelativeTime(repo.updatedAt)) : null
  ].filter((n): n is Node => n !== null)

  const right: Node[] = []
  const visual = languageVisual(languages, repo.language)
  if (visual) right.push(visual)
  right.push(ogBrand({ size: 34 }))

  return ogFrame([
    container({
      tw: 'flex h-full w-full flex-row items-stretch justify-between p-16',
      style: {},
      children: [
        container({
          tw: 'flex flex-1 flex-col justify-between',
          style: {},
          children: [
            container({ tw: 'flex flex-col', style: { gap: '22px' }, children: topLeft }),
            container({ tw: 'flex flex-row items-center', style: { gap: '36px' }, children: stats })
          ]
        }),
        container({
          tw: 'flex flex-col items-center justify-center',
          style: { width: '320px', gap: '36px' },
          children: right
        })
      ]
    })
  ])
}
