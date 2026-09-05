// Shared card for issues, pull/merge requests and discussions: a state pill
// (colored and iconed per state, mirroring `StateBadge.vue`'s semantics),
// title, and a byline of #number / author / comment count.
import { container, text } from '@takumi-rs/helpers'
import type { Node } from '@takumi-rs/core'
import { userLabel } from '~/utils'
import { ogBrand } from './og-brand'
import { ogFrame } from './og-frame'
import { FORGE_LABEL, ogIcon, type OgIconName } from './og-icons'
import { OG_FONT_FAMILY } from './og-render'

export type OgIssueLikeKind = 'issue' | 'pull' | 'discussion'

export interface OgIssueLikeData {
  kind: OgIssueLikeKind
  provider: string
  owner: string
  repo: string
  number?: number
  title: string
  author?: { login: string; displayName?: string | null } | null
  commentCount?: number
  /** issue/pull: 'open' | 'closed' | 'merged' | 'draft'; discussion: 'answered' | 'unanswered'. */
  state: string
}

interface StateMeta {
  color: string
  icon: OgIconName
  label: string
}

const GREEN = '#3fb950'
const RED = '#f85149'
const MUTED = 'rgba(255,255,255,0.5)'

function stateMeta(kind: OgIssueLikeKind, state: string): StateMeta {
  if (kind === 'discussion') {
    return state === 'answered'
      ? { color: GREEN, icon: 'message-square', label: 'Answered' }
      : { color: MUTED, icon: 'message-square', label: 'Discussion' }
  }
  if (kind === 'pull') {
    switch (state) {
      case 'merged':
        return { color: '#eab308', icon: 'git-merge', label: 'Merged' }
      case 'closed':
        return { color: RED, icon: 'git-pull-request-closed', label: 'Closed' }
      case 'draft':
        return { color: MUTED, icon: 'git-pull-request-draft', label: 'Draft' }
      default:
        return { color: GREEN, icon: 'git-pull-request', label: 'Open' }
    }
  }
  return state === 'closed'
    ? { color: RED, icon: 'circle-slash', label: 'Closed' }
    : { color: GREEN, icon: 'circle-dot', label: 'Open' }
}

export function ogIssueTemplate(data: OgIssueLikeData): Node {
  const meta = stateMeta(data.kind, data.state)
  const forgeLabel = FORGE_LABEL[data.provider] ?? data.provider

  const children: Node[] = [
    container({
      tw: 'flex flex-row items-center',
      style: { gap: '14px' },
      children: [
        container({
          tw: 'flex items-center rounded-full',
          style: { padding: '8px 20px', gap: '10px', backgroundColor: 'rgba(255,255,255,0.08)' },
          children: [
            ogIcon(meta.icon, 22, meta.color),
            text(meta.label, {
              fontFamily: OG_FONT_FAMILY,
              fontSize: 22,
              fontWeight: 600,
              color: meta.color
            })
          ]
        }),
        text(`${forgeLabel} · ${data.owner}/${data.repo}`, {
          fontFamily: OG_FONT_FAMILY,
          fontSize: 24,
          color: 'rgba(255,255,255,0.55)'
        })
      ]
    }),
    text(data.title, { fontFamily: OG_FONT_FAMILY, fontSize: 50, fontWeight: 700, color: 'white' })
  ]

  const footerParts: string[] = []
  if (data.number !== undefined) footerParts.push(`#${data.number}`)
  if (data.author) footerParts.push(`by ${userLabel(data.author)}`)
  if (data.commentCount !== undefined) {
    footerParts.push(`${data.commentCount} comment${data.commentCount === 1 ? '' : 's'}`)
  }
  if (footerParts.length) {
    children.push(
      text(footerParts.join('   ·   '), {
        fontFamily: OG_FONT_FAMILY,
        fontSize: 28,
        color: 'rgba(255,255,255,0.6)'
      })
    )
  }

  return ogFrame([
    container({
      tw: 'flex h-full w-full flex-col justify-between p-16',
      style: {},
      children: [
        container({
          tw: 'flex flex-col',
          style: { gap: '26px', maxWidth: '980px' },
          children
        }),
        ogBrand({ size: 34 })
      ]
    })
  ])
}
