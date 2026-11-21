// Picks the card for a route and the words that go with it. A card that can't be read (private,
// missing, rate limited) falls back to a plainer one, so a shared link always gets a preview, and
// never one that reveals a private repository.
import type { OgCard, OgPageCard } from './cards'
import { ogForges, ogOwnerCard, ogProfileCard, ogRepoCard, ogThreadCard } from './data'
import type { OgTarget } from './target'

export const SITE_NAME = 'maintainers.space'
const TAGLINE =
  'Browse repositories, issues and pull requests on GitHub, GitLab, Codeberg, Gitea, Bitbucket and Tangled.'

const SECTIONS: Record<string, { title: string; subtitle: string }> = {
  '': { title: 'One place for every forge.', subtitle: TAGLINE },
  dependencies: {
    title: 'Dependency updates',
    subtitle: 'Review and merge dependency updates across every repository you maintain.'
  },
  login: {
    title: 'Sign in',
    subtitle: 'Sign in with your atproto account, then link your forges.'
  },
  notifications: {
    title: 'Notifications',
    subtitle: 'Notifications from every forge you use, in one inbox.'
  },
  privacy: { title: 'Privacy', subtitle: 'What maintainers.space stores, and where.' },
  search: { title: 'Search every forge', subtitle: TAGLINE },
  settings: { title: 'Settings', subtitle: TAGLINE },
  terms: { title: 'Terms', subtitle: 'The terms for using maintainers.space.' },
  timeline: { title: 'Timeline', subtitle: 'Your activity across every forge, in one place.' }
}

function pageCard(section: string): OgPageCard {
  const copy = SECTIONS[section] ?? SECTIONS['']!
  return { forges: ogForges(), kind: 'page', subtitle: copy.subtitle, title: copy.title }
}

export async function loadOgCard(target: OgTarget): Promise<OgCard> {
  switch (target.kind) {
    case 'repo':
      return (await ogRepoCard(target.provider, target.owner, target.repo)) ?? pageCard('')
    case 'issue':
    case 'pull':
    case 'discussion':
      return (
        (await ogThreadCard(target.kind, target.provider, target.owner, target.repo, target.id)) ??
        (await ogRepoCard(target.provider, target.owner, target.repo)) ??
        pageCard('')
      )
    case 'owner':
      return (await ogOwnerCard(target.provider, target.owner)) ?? pageCard('')
    case 'profile':
      return (await ogProfileCard(target.handle)) ?? pageCard('')
    case 'page':
      return pageCard(target.section)
  }
}

const THREAD_NOUN = { discussion: 'Discussion', issue: 'Issue', pull: 'Pull request' } as const

/** The title and description shared links show next to the image. */
export function describeOgCard(card: OgCard): { title: string; description: string } {
  switch (card.kind) {
    case 'repo':
      return {
        description: card.description ?? `A ${card.forge.label} repository on ${SITE_NAME}.`,
        title: `${card.owner}/${card.name}`
      }
    case 'issue':
    case 'pull':
    case 'discussion': {
      const by = card.author ? ` by ${card.author}` : ''
      return {
        description: `${THREAD_NOUN[card.kind]} #${card.number}${by} in ${card.owner}/${card.repo} on ${card.forge.label}.`,
        title: `${card.title} · ${card.owner}/${card.repo}#${card.number}`
      }
    }
    case 'owner':
      return {
        description: `${card.repoCount}${card.repoCountIsLowerBound ? '+' : ''} repositories on ${card.forge.label}.`,
        title: card.owner
      }
    case 'profile':
      return {
        description: card.description ?? `@${card.handle} on ${SITE_NAME}.`,
        title: card.displayName ? `${card.displayName} (@${card.handle})` : `@${card.handle}`
      }
    case 'page':
      return { description: card.subtitle, title: card.title }
  }
}
