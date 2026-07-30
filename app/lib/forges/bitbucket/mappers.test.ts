import { describe, expect, it } from 'vitest'
import { loginOf, mapCommit, mapPull, mapRepo, mapUser } from './mappers'
import type { BbCommitResponse, BbPrResponse, BbRepoResponse } from './types'

describe('loginOf / mapUser', () => {
  it('prefers nickname over uuid for login', () => {
    expect(loginOf({ nickname: 'evan', uuid: '{abc-123}' })).toBe('evan')
  })

  it('falls back to uuid when nickname is absent', () => {
    expect(loginOf({ uuid: '{abc-123}' })).toBe('{abc-123}')
  })

  it('returns undefined for a missing user', () => {
    expect(mapUser(null)).toBeUndefined()
  })

  it('maps an account into a ForgeUser', () => {
    expect(
      mapUser({
        nickname: 'evan',
        display_name: 'Evan',
        links: { avatar: { href: 'https://bb.io/a.png' }, html: { href: 'https://bb.io/evan' } }
      })
    ).toEqual({
      provider: 'bitbucket',
      login: 'evan',
      displayName: 'Evan',
      avatarUrl: 'https://bb.io/a.png',
      url: 'https://bb.io/evan'
    })
  })
})

describe('mapRepo', () => {
  const raw: BbRepoResponse = {
    name: 'aui',
    slug: 'aui',
    full_name: 'atlassian/aui',
    description: 'Atlassian User Interface',
    is_private: false,
    language: 'javascript',
    mainbranch: { name: 'master' },
    workspace: {
      slug: 'atlassian',
      links: {
        html: { href: 'https://bitbucket.org/atlassian' },
        avatar: { href: 'https://bb.io/w.png' }
      }
    },
    website: 'https://docs.atlassian.com/aui/latest/',
    created_on: '2012-01-01T00:00:00Z',
    updated_on: '2024-06-01T00:00:00Z',
    links: { html: { href: 'https://bitbucket.org/atlassian/aui' } }
  }

  it('maps a full project response', () => {
    expect(mapRepo(raw)).toEqual({
      provider: 'bitbucket',
      owner: 'atlassian',
      name: 'aui',
      fullName: 'atlassian/aui',
      description: 'Atlassian User Interface',
      defaultBranch: 'master',
      url: 'https://bitbucket.org/atlassian/aui',
      ownerUrl: 'https://bitbucket.org/atlassian',
      ownerAvatar: 'https://bb.io/w.png',
      homepage: 'https://docs.atlassian.com/aui/latest/',
      language: 'javascript',
      topics: [],
      isPrivate: false,
      isFork: false,
      license: null,
      createdAt: '2012-01-01T00:00:00Z',
      updatedAt: '2024-06-01T00:00:00Z'
    })
  })

  it('derives the workspace slug from full_name when workspace is absent', () => {
    const mapped = mapRepo({ full_name: 'atlassian/aui', slug: 'aui' })
    expect(mapped.owner).toBe('atlassian')
  })

  it('flags forks via the presence of a parent field', () => {
    expect(mapRepo({ ...raw, parent: { full_name: 'upstream/aui' } }).isFork).toBe(true)
  })
})

describe('mapCommit', () => {
  it('parses the "Name <email>" raw git identity string', () => {
    const raw: BbCommitResponse = {
      hash: 'abc123def456',
      message: 'Fix bug',
      author: { raw: 'Evan You <evan@example.com>' },
      date: '2024-01-01T00:00:00Z',
      parents: [{ hash: 'parent1' }]
    }
    const mapped = mapCommit(raw)
    expect(mapped.shortSha).toBe('abc123d')
    expect(mapped.author).toEqual({
      name: 'Evan You',
      email: 'evan@example.com',
      login: undefined,
      avatarUrl: null,
      when: '2024-01-01T00:00:00Z'
    })
    expect(mapped.parents).toEqual(['parent1'])
  })

  it('prefers the linked account’s display_name and login over the raw string', () => {
    const raw: BbCommitResponse = {
      hash: 'abc123',
      author: {
        raw: 'evan <evan@example.com>',
        user: {
          display_name: 'Evan You',
          nickname: 'evan',
          links: { avatar: { href: 'https://bb.io/a.png' } }
        }
      }
    }
    const mapped = mapCommit(raw)
    expect(mapped.author?.name).toBe('Evan You')
    expect(mapped.author?.login).toBe('evan')
    expect(mapped.author?.avatarUrl).toBe('https://bb.io/a.png')
  })
})

describe('mapPull', () => {
  const raw: BbPrResponse = {
    id: 5400,
    title: 'Upmerge release into master',
    state: 'OPEN',
    author: { nickname: 'dc-core-bot' },
    description: null,
    source: { branch: { name: 'release/10.2.x' } },
    destination: { branch: { name: 'master' } },
    created_on: '2024-01-01T00:00:00Z',
    updated_on: '2024-01-02T00:00:00Z',
    comment_count: 3,
    links: { html: { href: 'https://bitbucket.org/atlassian/aui/pull-requests/5400' } }
  }

  it('maps an open PR', () => {
    const mapped = mapPull(raw)
    expect(mapped.state).toBe('open')
    expect(mapped.sourceBranch).toBe('release/10.2.x')
    expect(mapped.targetBranch).toBe('master')
    expect(mapped.mergedAt).toBeNull()
    expect(mapped.closedAt).toBeNull()
  })

  it('maps MERGED to merged, stamping mergedAt from updated_on', () => {
    const mapped = mapPull({ ...raw, state: 'MERGED' })
    expect(mapped.state).toBe('merged')
    expect(mapped.mergedAt).toBe('2024-01-02T00:00:00Z')
  })

  it('maps DECLINED and SUPERSEDED to closed', () => {
    expect(mapPull({ ...raw, state: 'DECLINED' }).state).toBe('closed')
    expect(mapPull({ ...raw, state: 'SUPERSEDED' }).state).toBe('closed')
  })
})
