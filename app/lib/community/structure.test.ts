import { describe, expect, it } from 'vitest'

import { CHANNEL_TYPE, type CommunityData } from './colibri'
import {
  channelName,
  describe as describeChannel,
  diffCommunity,
  hasMarker,
  planCommunity,
  repoChannel,
  REPO_CHANNEL_LIMIT,
  type PlanRepo
} from './structure'

function repo(name: string, extra: Partial<PlanRepo> = {}): PlanRepo {
  return {
    isArchived: false,
    isFork: false,
    isPrivate: false,
    name,
    url: `https://github.com/acme/${name}`,
    ...extra
  }
}

/** A community exactly as Colibri creates it, with "General" already renamed to "Welcome". */
function freshCommunity(): CommunityData {
  return {
    categories: [{ name: 'Welcome', uri: 'at://did:plc:c/social.colibri.category/welcome' }],
    channels: [
      {
        category: 'at://did:plc:c/social.colibri.category/welcome',
        name: 'general',
        type: CHANNEL_TYPE.text,
        uri: 'at://did:plc:c/social.colibri.channel/general'
      }
    ],
    community: { name: 'acme', uri: 'at://did:plc:c/social.colibri.community/self' },
    did: 'did:plc:c',
    members: [],
    roles: [{ name: 'Owner', protected: true, uri: 'at://did:plc:c/social.colibri.role/owner' }]
  }
}

describe('suggested community layout', () => {
  it('gives every owner announcements, general, showcase and support', () => {
    const plan = planCommunity({ owner: 'acme', repos: [] })

    expect(plan.categories.map((c) => c.name)).toEqual(['Welcome', 'Help'])
    expect(plan.categories.flatMap((c) => c.channels.map((ch) => [ch.name, ch.type]))).toEqual([
      ['announcements', CHANNEL_TYPE.text],
      ['general', CHANNEL_TYPE.text],
      ['showcase', CHANNEL_TYPE.forum],
      ['support', CHANNEL_TYPE.forum]
    ])
    expect(plan.categories[0]!.channels[0]!.ownerOnly).toBe(true)
  })

  it('opens a channel per maintained public repository, most starred first', () => {
    const plan = planCommunity({
      owner: 'acme',
      repos: [
        repo('docs', { stars: 10 }),
        repo('core', { stars: 900 }),
        repo('fork', { isFork: true, stars: 5000 }),
        repo('old', { isArchived: true, stars: 5000 }),
        repo('secret', { isPrivate: true, stars: 5000 })
      ]
    })

    const repos = plan.categories.find((c) => c.key === 'repositories')!
    expect(repos.channels.map((c) => c.name)).toEqual(['core', 'docs'])
    expect(repos.channels[0]!.description).toContain('https://github.com/acme/core')
  })

  it('stops at the repository limit', () => {
    const many = Array.from({ length: REPO_CHANNEL_LIMIT + 5 }, (_, i) => repo(`r${i}`))

    const plan = planCommunity({ owner: 'acme', repos: many })

    expect(plan.categories.find((c) => c.key === 'repositories')!.channels).toHaveLength(
      REPO_CHANNEL_LIMIT
    )
  })

  it('gives visible teams a role and a channel only they post in, and leaves secret teams out', () => {
    const plan = planCommunity({
      owner: 'acme',
      repos: [],
      teams: [
        {
          name: 'Core Team',
          slug: 'core-team',
          url: 'https://github.com/orgs/acme/teams/core-team',
          visibility: 'closed'
        },
        {
          name: 'Security',
          slug: 'security',
          url: 'https://github.com/orgs/acme/teams/security',
          visibility: 'secret'
        }
      ]
    })

    expect(plan.roles).toEqual([
      { name: 'Core Team', team: 'https://github.com/orgs/acme/teams/core-team' }
    ])
    const teams = plan.categories.find((c) => c.key === 'teams')!
    expect(teams.channels.map((c) => [c.name, c.team])).toEqual([
      ['core-team', 'https://github.com/orgs/acme/teams/core-team']
    ])
  })
})

describe('syncing a community', () => {
  it('creates only what a fresh community lacks, reusing its #general', () => {
    const plan = planCommunity({ owner: 'acme', repos: [repo('core')] })

    const ops = diffCommunity(plan, freshCommunity())

    expect(
      ops.map((op) => (op.kind === 'createChannel' ? `#${op.channel.name}` : op.kind))
    ).toEqual([
      '#announcements',
      '#showcase',
      'createCategory',
      '#support',
      'createCategory',
      '#core'
    ])
    const announcements = ops[0]!
    expect(announcements.kind === 'createChannel' && announcements.categoryUri).toBe(
      'at://did:plc:c/social.colibri.category/welcome'
    )
  })

  it('changes nothing on a second run', () => {
    const plan = planCommunity({ owner: 'acme', repos: [repo('core')] })
    const synced = freshCommunity()
    synced.categories.push(
      { name: 'Help', uri: 'at://did:plc:c/social.colibri.category/help' },
      { name: 'Repositories', uri: 'at://did:plc:c/social.colibri.category/repos' }
    )
    for (const category of plan.categories) {
      for (const channel of category.channels) {
        if (channel.name === 'general') continue
        synced.channels.push({
          category: 'at://did:plc:c/social.colibri.category/x',
          description: channel.description,
          name: channel.name,
          type: channel.type,
          uri: `at://did:plc:c/social.colibri.channel/${channel.name}`
        })
      }
    }

    expect(diffCommunity(plan, synced)).toEqual([])
  })

  it('keeps a repository channel that maintainers renamed or moved', () => {
    const plan = planCommunity({ owner: 'acme', repos: [repo('core')] })
    const data = freshCommunity()
    data.channels.push({
      category: 'at://did:plc:c/social.colibri.category/welcome',
      description: 'Our framework · https://github.com/acme/core',
      name: 'framework-chat',
      type: CHANNEL_TYPE.text,
      uri: 'at://did:plc:c/social.colibri.channel/renamed'
    })

    const ops = diffCommunity(plan, data)

    expect(ops.some((op) => op.kind === 'createChannel' && op.channel.name === 'core')).toBe(false)
    expect(repoChannel(data, 'https://github.com/acme/core')).toBe('renamed')
  })

  it('does not reuse an existing role or create it twice', () => {
    const plan = planCommunity({
      owner: 'acme',
      repos: [],
      teams: [{ name: 'Core', slug: 'core', url: 'https://github.com/orgs/acme/teams/core' }]
    })
    const data = freshCommunity()
    data.roles.push({ name: 'core', uri: 'at://did:plc:c/social.colibri.role/core' })

    expect(diffCommunity(plan, data).some((op) => op.kind === 'createRole')).toBe(false)
  })
})

describe('channel names and descriptions', () => {
  it('turns a repository name into a channel name', () => {
    expect(channelName('Nuxt.js_Docs')).toBe('nuxt-js-docs')
    expect(channelName('Ünïcödé')).toBe('unicode')
    expect(channelName('🚀')).toBe('channel')
    expect(channelName('a'.repeat(40))).toHaveLength(32)
  })

  it('keeps the URL whole when the description is too long', () => {
    const url = 'https://github.com/acme/core'
    const text = describeChannel('x'.repeat(400), url)

    expect(text.length).toBeLessThanOrEqual(256)
    expect(text.endsWith(` · ${url}`)).toBe(true)
  })

  it('matches a URL only as a whole', () => {
    expect(hasMarker('About · https://github.com/acme/core', 'https://github.com/acme/core')).toBe(
      true
    )
    expect(
      hasMarker('About · https://github.com/acme/core-ui', 'https://github.com/acme/core')
    ).toBe(false)
    expect(
      hasMarker('About · https://github.com/acme/core.js', 'https://github.com/acme/core')
    ).toBe(false)
    expect(hasMarker('About · https://GitHub.com/Acme/Core', 'https://github.com/acme/core')).toBe(
      true
    )
  })
})
