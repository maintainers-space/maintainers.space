// The OG cards, as HTML that Takumi renders to a 1200x630 PNG. Every card shares one frame: the
// app's near-black background, a soft yellow glow in the corner, the forge in the footer and the
// maintainers.space mark beside it. Data arrives already fetched (see ./data), so these stay pure.
import { compact, esc, fitTitle, icon, shortDate } from './html'
import type { OgIconName } from './icon-data'
import { languageColor } from './language-colors'

export const OG_WIDTH = 1200
export const OG_HEIGHT = 630

const COLOR = {
  bg: '#09090b',
  border: '#27272a',
  brand: '#facc15',
  dim: '#71717a',
  muted: '#a1a1aa',
  soft: '#d4d4d8',
  text: '#fafafa'
}

export interface OgForge {
  /** App route id, e.g. `codeberg`. */
  id: string
  label: string
  /** Brand colour, used for the second glow. */
  color: string
}

export interface OgLanguage {
  name: string
  share: number
}

export interface OgRepoCard {
  kind: 'repo'
  forge: OgForge
  owner: string
  name: string
  description?: string
  avatar?: string
  stars?: number
  forks?: number
  issues?: number
  pulls?: number
  language?: string
  languages?: OgLanguage[]
  isFork?: boolean
  isArchived?: boolean
}

export type OgThreadState = 'open' | 'closed' | 'merged' | 'draft'

export interface OgThreadCard {
  kind: 'issue' | 'pull' | 'discussion'
  forge: OgForge
  owner: string
  repo: string
  repoAvatar?: string
  number: string
  title: string
  state: OgThreadState
  author?: string
  authorAvatar?: string
  createdAt?: Date
  comments?: number
  additions?: number
  deletions?: number
  labels?: Array<{ name: string; color?: string }>
}

export interface OgOwnerCard {
  kind: 'owner'
  forge: OgForge
  owner: string
  ownerLabel: string
  avatar?: string
  repoCount: number
  repoCountIsLowerBound: boolean
  topRepos: Array<{ name: string; stars?: number; language?: string }>
}

export interface OgProfileCard {
  kind: 'profile'
  handle: string
  displayName?: string
  avatar?: string
  description?: string
  accounts: Array<{ forge: OgForge; username: string }>
}

export interface OgPageCard {
  kind: 'page'
  title: string
  subtitle: string
  forges: OgForge[]
}

export type OgCard = OgRepoCard | OgThreadCard | OgOwnerCard | OgProfileCard | OgPageCard

export function renderCard(card: OgCard, logo: string): string {
  switch (card.kind) {
    case 'repo':
      return repoCard(card, logo)
    case 'issue':
    case 'pull':
    case 'discussion':
      return threadCard(card, logo)
    case 'owner':
      return ownerCard(card, logo)
    case 'profile':
      return profileCard(card, logo)
    case 'page':
      return pageCard(card, logo)
  }
}

// --- Shared pieces --------------------------------------------------------------------------

function frame(
  content: string,
  options: { logo: string; forge?: OgForge; stripe?: string }
): string {
  const forgeGlow = options.forge?.color ?? '#3b82f6'
  return `<div style="display:flex;flex-direction:column;position:relative;width:${OG_WIDTH}px;height:${OG_HEIGHT}px;overflow:hidden;background-color:${COLOR.bg};color:${COLOR.text};font-family:Geist">
    <div style="position:absolute;top:-340px;right:-260px;width:820px;height:820px;border-radius:9999px;background-image:radial-gradient(circle, rgba(251,191,36,0.24) 0%, rgba(245,158,11,0.10) 32%, rgba(234,88,12,0.03) 52%, rgba(234,88,12,0) 68%)"></div>
    <div style="position:absolute;bottom:-420px;left:-300px;width:820px;height:820px;border-radius:9999px;background-image:radial-gradient(circle, ${withAlpha(forgeGlow, 0.16)} 0%, ${withAlpha(forgeGlow, 0)} 65%)"></div>
    <div style="display:flex;flex-direction:column;flex-grow:1;padding:64px 72px 0 72px">${content}</div>
    ${footer(options.logo, options.forge)}
    ${options.stripe ?? brandStripe()}
  </div>`
}

function footer(logo: string, forge?: OgForge): string {
  const left = forge
    ? `<div style="display:flex;align-items:center;gap:12px;font-size:24px;color:${COLOR.muted}">${forgeIcon(forge.id, 28, COLOR.soft)}<span>${esc(forge.label)}</span></div>`
    : '<div style="display:flex"></div>'
  return `<div style="display:flex;align-items:center;justify-content:space-between;padding:0 72px 40px 72px">
    ${left}
    <div style="display:flex;align-items:center;gap:14px">
      <div style="display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:12px;background-color:${COLOR.brand}"><img src="${logo}" style="width:28px;height:28px" /></div>
      <span style="font-size:26px;font-weight:600;letter-spacing:-0.5px">maintainers.space</span>
    </div>
  </div>`
}

function brandStripe(): string {
  return `<div style="display:flex;height:10px;background-image:linear-gradient(90deg, #facc15, #f59e0b 55%, #fde047)"></div>`
}

function languageStripe(languages: OgLanguage[]): string {
  const total = languages.reduce((sum, l) => sum + l.share, 0) || 1
  const segments = languages
    .map(
      (l) =>
        `<div style="display:flex;flex-grow:${(l.share / total).toFixed(4)};flex-basis:0;background-color:${languageColor(l.name)}"></div>`
    )
    .join('')
  return `<div style="display:flex;height:10px">${segments}</div>`
}

const FORGE_ICON: Record<string, OgIconName> = {
  bitbucket: 'forge-bitbucket',
  codeberg: 'forge-codeberg',
  gitea: 'forge-gitea',
  github: 'forge-github',
  gitlab: 'forge-gitlab',
  tangled: 'forge-tangled'
}

function forgeIcon(id: string, size: number, color: string): string {
  return icon(FORGE_ICON[id] ?? 'book-marked', size, color)
}

/** A picture, or the forge's mark on a dark tile when there is none (or it fails to load). */
function avatar(src: string | undefined, size: number, radius: string, forgeId?: string): string {
  const tile = `display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:${radius};border:2px solid ${COLOR.border};flex-shrink:0;background-color:#18181b`
  const mark = forgeId ? forgeIcon(forgeId, Math.round(size * 0.46), COLOR.dim) : ''
  if (!src) return `<div style="${tile}">${mark}</div>`
  return `<div style="${tile};overflow:hidden;position:relative">${mark}<img src="${esc(src)}" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover" /></div>`
}

function stat(name: OgIconName, value: string, label: string): string {
  return `<div style="display:flex;flex-direction:column;gap:6px">
    <div style="display:flex;align-items:center;gap:12px">${icon(name, 30, COLOR.muted)}<span style="font-size:40px;font-weight:600;letter-spacing:-1px">${esc(value)}</span></div>
    <span style="font-size:22px;color:${COLOR.dim};white-space:nowrap">${esc(label)}</span>
  </div>`
}

function pill(content: string, background: string, color: string): string {
  return `<div style="display:flex;align-items:center;gap:10px;padding:10px 22px;border-radius:9999px;background-color:${background};color:${color};font-size:26px;font-weight:600">${content}</div>`
}

function clamp(lines: number): string {
  return `display:block;line-clamp:${lines};text-overflow:ellipsis;overflow:hidden`
}

function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(value.slice(i, i + 2), 16))
  return `rgba(${r},${g},${b},${alpha})`
}

// --- Repository ----------------------------------------------------------------------------

function repoCard(card: OgRepoCard, logo: string): string {
  const fullLength = card.owner.length + card.name.length + 1
  const size = fitTitle(fullLength, [
    [18, 84],
    [26, 72],
    [34, 60],
    [48, 50]
  ])
  const badges = [card.isFork ? 'Fork' : '', card.isArchived ? 'Archived' : '']
    .filter(Boolean)
    .map(
      (b) =>
        `<span style="padding:4px 14px;border-radius:9999px;border:2px solid ${COLOR.border};font-size:20px;color:${COLOR.muted}">${b}</span>`
    )
    .join('')
  const stats = [
    card.stars !== undefined ? stat('star', compact(card.stars), 'Stars') : '',
    card.forks !== undefined ? stat('git-fork', compact(card.forks), 'Forks') : '',
    card.issues !== undefined ? stat('circle-dot', compact(card.issues), 'Issues') : '',
    card.pulls !== undefined ? stat('git-pull-request', compact(card.pulls), 'Pull requests') : ''
  ]
    .filter(Boolean)
    .join('')
  const languages = card.languages?.length
    ? card.languages
    : card.language
      ? [{ name: card.language, share: 1 }]
      : []
  const statCount = [card.stars, card.forks, card.issues, card.pulls].filter(
    (v) => v !== undefined
  ).length
  const legend = languages
    .slice(0, statCount >= 4 ? 2 : 3)
    .map(
      (l) =>
        `<div style="display:flex;align-items:center;gap:10px"><div style="width:16px;height:16px;border-radius:9999px;background-color:${languageColor(l.name)}"></div><span>${esc(l.name)}</span></div>`
    )
    .join('')

  const content = `
    <div style="display:flex;justify-content:space-between;gap:48px">
      <div style="display:flex;flex-direction:column;gap:22px;flex-grow:1;flex-basis:0;min-width:0">
        <div style="display:block;font-size:${size}px;line-height:1.08;letter-spacing:-2px;overflow-wrap:anywhere">
          <span style="font-weight:300;color:${COLOR.soft}">${esc(card.owner)}/</span><span style="font-weight:700">${esc(card.name)}</span>
        </div>
        ${badges ? `<div style="display:flex;gap:10px">${badges}</div>` : ''}
        ${card.description ? `<div style="${clamp(3)};font-size:30px;line-height:1.4;color:${COLOR.muted}">${esc(card.description)}</div>` : ''}
      </div>
      ${avatar(card.avatar, 176, '36px', card.forge.id)}
    </div>
    <div style="display:flex;flex-grow:1"></div>
    <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:32px;padding-bottom:36px">
      <div style="display:flex;gap:56px">${stats}</div>
      ${legend ? `<div style="display:flex;gap:22px;font-size:22px;color:${COLOR.muted}">${legend}</div>` : ''}
    </div>`
  return frame(content, {
    forge: card.forge,
    logo,
    stripe: languages.length ? languageStripe(languages) : undefined
  })
}

// --- Issues, pull requests and discussions --------------------------------------------------

const STATE_STYLE: Record<
  OgThreadCard['kind'],
  Partial<Record<OgThreadState, { label: string; icon: OgIconName; bg: string; fg: string }>>
> = {
  issue: {
    open: { label: 'Open', icon: 'circle-dot', bg: '#16a34a', fg: '#ffffff' },
    closed: { label: 'Closed', icon: 'circle-check', bg: '#7c3aed', fg: '#ffffff' }
  },
  pull: {
    open: { label: 'Open', icon: 'git-pull-request', bg: '#16a34a', fg: '#ffffff' },
    draft: { label: 'Draft', icon: 'git-pull-request-draft', bg: '#3f3f46', fg: '#ffffff' },
    merged: { label: 'Merged', icon: 'git-merge', bg: '#7c3aed', fg: '#ffffff' },
    closed: { label: 'Closed', icon: 'git-pull-request-closed', bg: '#dc2626', fg: '#ffffff' }
  },
  discussion: {
    open: { label: 'Open', icon: 'messages-square', bg: '#16a34a', fg: '#ffffff' },
    closed: { label: 'Answered', icon: 'circle-check', bg: '#7c3aed', fg: '#ffffff' }
  }
}

function threadCard(card: OgThreadCard, logo: string): string {
  const state = STATE_STYLE[card.kind][card.state] ?? STATE_STYLE[card.kind].open!
  const size = fitTitle(card.title.length, [
    [32, 68],
    [60, 58],
    [110, 48],
    [180, 42]
  ])
  const labels = (card.labels ?? [])
    .slice(0, 3)
    .map((l) => {
      const color = l.color ? `#${l.color.replace('#', '')}` : COLOR.muted
      return `<div style="display:flex;align-items:center;gap:10px;padding:6px 16px;border-radius:9999px;border:2px solid ${withAlpha(color, 0.55)};background-color:${withAlpha(color, 0.14)};font-size:21px;color:${COLOR.soft}"><div style="width:12px;height:12px;border-radius:9999px;background-color:${color}"></div>${esc(l.name)}</div>`
    })
    .join('')
  const meta = [
    card.author
      ? `<div style="display:flex;align-items:center;gap:14px">${avatar(card.authorAvatar, 44, '9999px')}<span style="font-weight:600;color:${COLOR.text}">${esc(card.author)}</span></div>`
      : '',
    card.createdAt
      ? `<div style="display:flex;align-items:center;gap:10px">${icon('calendar', 26, COLOR.dim)}${esc(shortDate(card.createdAt))}</div>`
      : '',
    card.comments !== undefined
      ? `<div style="display:flex;align-items:center;gap:10px">${icon('message-square', 26, COLOR.dim)}${esc(compact(card.comments))}</div>`
      : '',
    card.additions !== undefined && card.deletions !== undefined
      ? `<div style="display:flex;align-items:center;gap:12px;font-weight:600"><span style="color:#22c55e">+${esc(compact(card.additions))}</span><span style="color:#ef4444">−${esc(compact(card.deletions))}</span>${diffSquares(card.additions, card.deletions)}</div>`
      : ''
  ]
    .filter(Boolean)
    .join('')

  const content = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:32px">
      <div style="display:flex;align-items:center;gap:16px;font-size:30px;color:${COLOR.muted};min-width:0">
        ${avatar(card.repoAvatar, 52, '14px', card.forge.id)}
        <span style="display:block;text-overflow:ellipsis;overflow:hidden;white-space:nowrap">${esc(card.owner)} / <span style="color:${COLOR.text};font-weight:600">${esc(card.repo)}</span></span>
      </div>
      ${pill(`${icon(state.icon, 28, state.fg)}<span>${state.label}</span>`, state.bg, state.fg)}
    </div>
    <div style="${clamp(3)};margin-top:40px;font-size:${size}px;line-height:1.15;letter-spacing:-1.5px;font-weight:700;overflow-wrap:anywhere">
      <span style="font-weight:400;color:${COLOR.dim}">#${esc(card.number)} </span>${esc(card.title)}
    </div>
    ${labels ? `<div style="display:flex;gap:12px;margin-top:28px">${labels}</div>` : ''}
    <div style="display:flex;flex-grow:1"></div>
    <div style="display:flex;align-items:center;gap:36px;padding-bottom:36px;font-size:26px;color:${COLOR.muted}">${meta}</div>`
  return frame(content, { forge: card.forge, logo })
}

/** GitHub's five diff squares: green for the share of additions, red for deletions. */
function diffSquares(additions: number, deletions: number): string {
  const total = additions + deletions
  const green = total ? Math.round((additions / total) * 5) : 0
  const red = total ? 5 - green : 0
  const squares = Array.from({ length: 5 }, (_, i) =>
    i < green ? '#22c55e' : i < green + red ? '#ef4444' : '#3f3f46'
  )
  return `<div style="display:flex;gap:5px">${squares.map((c) => `<div style="width:18px;height:18px;border-radius:4px;background-color:${c}"></div>`).join('')}</div>`
}

// --- Owners ----------------------------------------------------------------------------------

function ownerCard(card: OgOwnerCard, logo: string): string {
  const count = `${compact(card.repoCount)}${card.repoCountIsLowerBound ? '+' : ''} ${card.repoCount === 1 ? 'repository' : 'repositories'}`
  const repos = card.topRepos
    .slice(0, 3)
    .map(
      (
        r
      ) => `<div style="display:flex;flex-direction:column;justify-content:space-between;gap:18px;flex-grow:1;flex-basis:0;min-width:0;padding:24px 28px;border-radius:24px;border:2px solid ${COLOR.border};background-color:rgba(24,24,27,0.7)">
        <div style="display:flex;align-items:center;gap:12px;font-size:28px;font-weight:600;min-width:0">${icon('book-marked', 26, COLOR.muted)}<span style="display:block;text-overflow:ellipsis;overflow:hidden;white-space:nowrap">${esc(r.name)}</span></div>
        <div style="display:flex;align-items:center;gap:22px;font-size:22px;color:${COLOR.muted}">
          ${r.stars !== undefined ? `<div style="display:flex;align-items:center;gap:8px">${icon('star', 22, COLOR.muted)}${esc(compact(r.stars))}</div>` : ''}
          ${r.language ? `<div style="display:flex;align-items:center;gap:8px"><div style="width:14px;height:14px;border-radius:9999px;background-color:${languageColor(r.language)}"></div>${esc(r.language)}</div>` : ''}
        </div>
      </div>`
    )
    .join('')
  const size = fitTitle(card.owner.length, [
    [14, 84],
    [22, 68],
    [32, 54]
  ])
  const content = `
    <div style="display:flex;align-items:center;gap:40px">
      ${avatar(card.avatar, 168, '40px', card.forge.id)}
      <div style="display:flex;flex-direction:column;gap:14px;min-width:0">
        <div style="display:block;font-size:${size}px;font-weight:700;letter-spacing:-2px;line-height:1.05;overflow-wrap:anywhere">${esc(card.owner)}</div>
        <div style="display:flex;align-items:center;gap:14px;font-size:28px;color:${COLOR.muted}"><span>${esc(card.ownerLabel)}</span><span style="color:${COLOR.dim}">·</span><span>${esc(count)}</span></div>
      </div>
    </div>
    <div style="display:flex;flex-grow:1"></div>
    ${repos ? `<div style="display:flex;gap:24px;padding-bottom:36px">${repos}</div>` : ''}`
  return frame(content, { forge: card.forge, logo })
}

// --- atproto profiles -------------------------------------------------------------------------

function profileCard(card: OgProfileCard, logo: string): string {
  const name = card.displayName?.trim() || card.handle
  const size = fitTitle(name.length, [
    [16, 80],
    [26, 64],
    [40, 52]
  ])
  const accounts = card.accounts
    .slice(0, 5)
    .map(
      (a) =>
        `<div style="display:flex;align-items:center;gap:12px;padding:12px 22px;border-radius:9999px;border:2px solid ${COLOR.border};background-color:rgba(24,24,27,0.7);font-size:24px;color:${COLOR.soft}">${forgeIcon(a.forge.id, 26, COLOR.soft)}<span>${esc(a.username)}</span></div>`
    )
    .join('')
  const header = `
    <div style="display:flex;align-items:center;gap:44px">
      <div style="display:flex;padding:6px;border-radius:9999px;background-image:linear-gradient(135deg, #fde047, #f59e0b)">${avatar(card.avatar, 196, '9999px')}</div>
      <div style="display:flex;flex-direction:column;gap:12px;flex-grow:1;flex-basis:0;min-width:0">
        <div style="display:block;font-size:${size}px;font-weight:700;letter-spacing:-2px;line-height:1.05;overflow-wrap:anywhere">${esc(name)}</div>
        <div style="display:block;font-size:30px;color:${COLOR.muted};overflow-wrap:anywhere">@${esc(card.handle)}</div>
        ${card.description ? `<div style="${clamp(2)};margin-top:8px;font-size:26px;line-height:1.4;color:${COLOR.muted}">${esc(card.description)}</div>` : ''}
      </div>
    </div>`
  // Linked forges sit at the bottom; without any, the profile is centred instead of leaving the
  // lower half empty.
  const content = accounts
    ? `${header}
    <div style="display:flex;flex-grow:1"></div>
    <div style="display:flex;flex-wrap:wrap;gap:14px;padding-bottom:36px">${accounts}</div>`
    : `<div style="display:flex;flex-direction:column;justify-content:center;flex-grow:1;padding-bottom:24px">${header}</div>`
  return frame(content, { logo })
}

// --- Everything else ----------------------------------------------------------------------------

function pageCard(card: OgPageCard, logo: string): string {
  const forges = card.forges
    .map(
      (f) =>
        `<div style="display:flex;align-items:center;justify-content:center;width:76px;height:76px;border-radius:22px;border:2px solid ${COLOR.border};background-color:rgba(24,24,27,0.7)">${forgeIcon(f.id, 38, COLOR.soft)}</div>`
    )
    .join('')
  const content = `
    <div style="display:flex;flex-direction:column;justify-content:center;flex-grow:1;gap:28px;padding-bottom:20px">
      <div style="display:block;font-size:92px;font-weight:700;letter-spacing:-3px;line-height:1.02">${esc(card.title)}</div>
      <div style="display:block;max-width:900px;font-size:34px;line-height:1.4;color:${COLOR.muted}">${esc(card.subtitle)}</div>
      <div style="display:flex;gap:16px;margin-top:12px">${forges}</div>
    </div>`
  return frame(content, { logo })
}
