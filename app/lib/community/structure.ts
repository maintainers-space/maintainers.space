// The layout maintainers.space suggests for a forge owner's Community, and what it takes to get an
// existing community there. Pure, so it can be previewed before anything is created and tested
// without a network.
//
// Syncing only ever adds: it creates what is missing and never renames, moves, restricts or deletes
// what is already there. That makes the layout a starting point people can adjust, and a sync safe
// to run again whenever repositories or teams change.
import { CHANNEL_TYPE, type ChannelType, type CommunityData } from './colibri'

/** Colibri's limits for names and descriptions. */
const NAME_MAX = 32
const DESCRIPTION_MAX = 256

/** How many repositories get a channel; the rest can be added by hand. */
export const REPO_CHANNEL_LIMIT = 30

export type CategoryKey = 'welcome' | 'help' | 'repositories' | 'teams'

export interface PlannedChannel {
  name: string
  type: ChannelType
  description: string
  /** Only owners and admins may post, for announcements. */
  ownerOnly?: boolean
  /** Only this team's role may post. */
  team?: string
  /**
   * What identifies the channel's subject in its description, such as a repository's URL, so a
   * renamed channel is still recognised. Default channels have none and are matched by name.
   */
  marker?: string
}

export interface PlannedCategory {
  key: CategoryKey
  name: string
  channels: PlannedChannel[]
}

export interface PlannedRole {
  /** The team's URL, which identifies the team the role stands for. */
  team: string
  name: string
}

export interface CommunityPlan {
  categories: PlannedCategory[]
  roles: PlannedRole[]
}

export interface PlanRepo {
  name: string
  description?: string
  url: string
  stars?: number
  isFork: boolean
  isArchived: boolean
  isPrivate: boolean
}

export interface PlanTeam {
  name: string
  slug: string
  description?: string
  url: string
  /** The forge's own visibility, e.g. GitHub's `closed` (visible) or `secret`. */
  visibility?: string
}

/** A channel name in Colibri's style: lowercase words joined by dashes. */
export function channelName(value: string): string {
  const name = value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, NAME_MAX)
    .replace(/-+$/, '')
  return name || 'channel'
}

/** A description that ends with `marker`, shortened so both fit. */
export function describe(text: string | undefined, marker?: string): string {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim()
  if (!marker) return clean.slice(0, DESCRIPTION_MAX)
  const room = DESCRIPTION_MAX - marker.length - 3
  if (!clean || room < 1) return marker.slice(0, DESCRIPTION_MAX)
  const short = clean.length > room ? `${clean.slice(0, room - 1).trimEnd()}…` : clean
  return `${short} · ${marker}`
}

/** Secret teams stay out of a community, whose records are public. */
function isVisibleTeam(team: PlanTeam): boolean {
  const visibility = team.visibility?.toLowerCase()
  return visibility !== 'secret' && visibility !== 'private'
}

/** Repositories worth a channel: public, maintained originals, most starred first. */
export function channelRepos(repos: readonly PlanRepo[]): PlanRepo[] {
  return repos
    .filter((r) => !r.isFork && !r.isArchived && !r.isPrivate)
    .toSorted((a, b) => (b.stars ?? 0) - (a.stars ?? 0) || a.name.localeCompare(b.name))
    .slice(0, REPO_CHANNEL_LIMIT)
}

export function planCommunity(input: {
  owner: string
  repos: readonly PlanRepo[]
  teams?: readonly PlanTeam[]
}): CommunityPlan {
  const repos = channelRepos(input.repos)
  const teams = (input.teams ?? []).filter(isVisibleTeam)
  const categories: PlannedCategory[] = [
    {
      channels: [
        {
          description: `News and releases from ${input.owner}.`,
          name: 'announcements',
          ownerOnly: true,
          type: CHANNEL_TYPE.text
        },
        {
          description: `Say hi and talk about anything around ${input.owner}.`,
          name: 'general',
          type: CHANNEL_TYPE.text
        },
        {
          description: 'Show what you built. One thread per project.',
          name: 'showcase',
          type: CHANNEL_TYPE.forum
        }
      ],
      key: 'welcome',
      name: 'Welcome'
    },
    {
      channels: [
        {
          description: 'Ask for help. One thread per question, so answers stay findable.',
          name: 'support',
          type: CHANNEL_TYPE.forum
        }
      ],
      key: 'help',
      name: 'Help'
    }
  ]
  if (repos.length) {
    categories.push({
      channels: repos.map((repo) => ({
        description: describe(repo.description, repo.url),
        marker: repo.url,
        name: channelName(repo.name),
        type: CHANNEL_TYPE.text
      })),
      key: 'repositories',
      name: 'Repositories'
    })
  }
  if (teams.length) {
    categories.push({
      channels: teams.map((team) => ({
        description: describe(team.description ?? `The ${team.name} team.`, team.url),
        marker: team.url,
        name: channelName(team.slug || team.name),
        team: team.url,
        type: CHANNEL_TYPE.text
      })),
      key: 'teams',
      name: 'Teams'
    })
  }
  return {
    categories,
    roles: teams.map((team) => ({ name: team.name.slice(0, NAME_MAX), team: team.url }))
  }
}

// --- Diffing ---------------------------------------------------------------------------------

export type CommunityOp =
  | { kind: 'createCategory'; category: CategoryKey; name: string }
  | { kind: 'createRole'; role: PlannedRole }
  | {
      kind: 'createChannel'
      category: CategoryKey
      /** The existing category's URI, or undefined when an earlier op creates it. */
      categoryUri?: string
      channel: PlannedChannel
    }

function rkeyOf(uri: string): string {
  return uri.split('/').pop() ?? ''
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/** Whether a description names `marker`, as a whole URL: `…/nuxt` is not `…/nuxt.com`. */
export function hasMarker(description: string | undefined, marker: string): boolean {
  if (!description) return false
  const escaped = marker.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`${escaped}(?![\\w./-])`).test(description.toLowerCase())
}

/** Every step that would bring `data` up to `plan`, in an order that can run as listed. */
export function diffCommunity(plan: CommunityPlan, data: CommunityData): CommunityOp[] {
  const ops: CommunityOp[] = []
  for (const role of plan.roles) {
    if (!data.roles.some((r) => sameName(r.name, role.name))) ops.push({ kind: 'createRole', role })
  }

  for (const category of plan.categories) {
    const existing = data.categories.find((c) => sameName(c.name, category.name))
    if (!existing) ops.push({ category: category.key, kind: 'createCategory', name: category.name })

    for (const channel of category.channels) {
      // A channel that already exists anywhere counts, so moving it to another category sticks.
      const match = channel.marker
        ? data.channels.some((c) => hasMarker(c.description, channel.marker!))
        : data.channels.some((c) => c.type === channel.type && sameName(c.name, channel.name))
      if (!match) {
        ops.push({
          category: category.key,
          categoryUri: existing?.uri,
          channel,
          kind: 'createChannel'
        })
      }
    }
  }
  return ops
}

/** The channel a repository page opens on, matched by its URL as the sync wrote it. */
export function repoChannel(data: CommunityData, repoUrl: string): string | undefined {
  const channel = data.channels.find((c) => hasMarker(c.description, repoUrl))
  return channel ? rkeyOf(channel.uri) : undefined
}

export { rkeyOf }
