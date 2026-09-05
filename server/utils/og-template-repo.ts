// The flagship OG image: forge badge, owner/repo title, description, topic
// pills, a GitHub-style segmented language bar with a legend (or a single
// color dot + name when the forge only reports one top language), and a
// stat row, all in one column with the brand mark tucked into its corner.
import { container, text } from '@takumi-rs/helpers'
import type { Node } from '@takumi-rs/core'
import { formatCompactNumber, formatRelativeTime } from '~/utils'
import type { OgRepoData } from './og-data'
import { ogBrand } from './og-brand'
import { ogFrame } from './og-frame'
import { FORGE_LABEL, ogIcon, type OgIconName } from './og-icons'
import { languageColor } from './og-language-colors'
import { buildLanguageRing, type LanguageRingSegment } from './og-language-ring'
import { OG_FONT_FAMILY } from './og-render'

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

/** A thin segmented bar, each language's width proportional to its share — mirrors GitHub's own repo language bar. */
function languageBar(segments: LanguageRingSegment[]): Node {
  return container({
    tw: 'flex flex-row overflow-hidden rounded-full',
    style: { width: '100%', height: '14px' },
    children: segments.map((s) =>
      container({
        tw: 'flex',
        style: { flexGrow: s.percent, flexBasis: '0%', height: '100%', backgroundColor: s.color },
        children: []
      })
    )
  })
}

function languageLegend(segments: LanguageRingSegment[]): Node {
  // Segments rounding to 0% just add noise to the legend (the bar itself
  // still shows their sliver) — always keep at least the top one though, so
  // an unusually even split never empties the legend out entirely.
  const shown = segments.filter((s, i) => i === 0 || s.percent >= 1)
  return container({
    tw: 'flex flex-row flex-wrap items-center',
    style: { gap: '22px' },
    children: shown.map((s) =>
      container({
        tw: 'flex items-center',
        style: { gap: '9px' },
        children: [
          container({
            tw: 'rounded-full',
            style: { width: '13px', height: '13px', backgroundColor: s.color },
            children: []
          }),
          text(`${s.name} ${Math.round(s.percent)}%`, {
            fontFamily: OG_FONT_FAMILY,
            fontSize: 21,
            color: 'rgba(255,255,255,0.7)'
          })
        ]
      })
    )
  })
}

/** The GitHub-style language bar + legend, or a single color dot + name when only one top language is known. */
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
            width: '16px',
            height: '16px',
            backgroundColor: languageColor(fallbackLanguage)
          },
          children: []
        }),
        text(fallbackLanguage, { fontFamily: OG_FONT_FAMILY, fontSize: 26, color: 'white' })
      ]
    })
  }

  return container({
    tw: 'flex flex-col',
    style: { gap: '16px' },
    children: [languageBar(segments), languageLegend(segments)]
  })
}

export function ogRepoTemplate({ repo, languages }: OgRepoData): Node {
  const forgeLabel = FORGE_LABEL[repo.provider] ?? repo.provider

  const content: Node[] = [
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
    content.push(
      text(truncate(repo.description, 170), {
        fontFamily: OG_FONT_FAMILY,
        fontSize: 30,
        color: 'rgba(255,255,255,0.7)'
      })
    )
  }
  const topics = (repo.topics ?? []).slice(0, 4)
  if (topics.length) {
    content.push(
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
  const visual = languageVisual(languages, repo.language)
  if (visual) content.push(visual)

  const stats = [
    repo.stars !== undefined ? statItem('star', formatCompactNumber(repo.stars)) : null,
    repo.forks !== undefined ? statItem('git-fork', formatCompactNumber(repo.forks)) : null,
    repo.issues !== undefined ? statItem('circle-dot', formatCompactNumber(repo.issues)) : null,
    repo.updatedAt ? statItem('calendar', formatRelativeTime(repo.updatedAt)) : null
  ].filter((n): n is Node => n !== null)

  return ogFrame([
    container({
      tw: 'flex h-full w-full flex-col justify-between p-16',
      style: {},
      children: [
        container({ tw: 'flex flex-col', style: { gap: '24px' }, children: content }),
        container({
          tw: 'flex flex-row items-center justify-between',
          style: {},
          children: [
            container({
              tw: 'flex flex-row items-center',
              style: { gap: '36px' },
              children: stats
            }),
            ogBrand({ size: 34 })
          ]
        })
      ]
    })
  ])
}
