import { describe, expect, it } from 'vitest'
import { createGiteaFamilyMappers } from './mappers'
import type { GfActivityResponse, GfIssueResponse, GfPullResponse, GfRepoResponse } from './types'

const { mapUser, mapRepo, mapIssue, mapPull, mapEvent } = createGiteaFamilyMappers(
  'codeberg',
  'https://codeberg.org'
)

describe('mapUser', () => {
  it('returns undefined for a missing user', () => {
    expect(mapUser(null)).toBeUndefined()
  })

  it('maps a user, falling back to a webBase URL built from the login', () => {
    expect(
      mapUser({ login: 'forgejo', full_name: 'Forgejo', avatar_url: 'https://cb.io/a.png' })
    ).toEqual({
      provider: 'codeberg',
      login: 'forgejo',
      displayName: 'Forgejo',
      avatarUrl: 'https://cb.io/a.png',
      url: 'https://codeberg.org/forgejo'
    })
  })

  it('falls back from login to username, and from full_name to fullname', () => {
    expect(mapUser({ username: 'legacy', fullname: 'Legacy Name' })).toEqual({
      provider: 'codeberg',
      login: 'legacy',
      displayName: 'Legacy Name',
      avatarUrl: null,
      url: 'https://codeberg.org/legacy'
    })
  })
})

describe('mapRepo', () => {
  const raw: GfRepoResponse = {
    owner: {
      login: 'forgejo',
      html_url: 'https://codeberg.org/forgejo',
      avatar_url: 'https://cb.io/o.png'
    },
    name: 'forgejo',
    full_name: 'forgejo/forgejo',
    description: 'Beyond coding. We forge.',
    default_branch: 'forgejo',
    html_url: 'https://codeberg.org/forgejo/forgejo',
    website: 'https://forgejo.org',
    language: 'Go',
    topics: ['forge', 'git'],
    stars_count: 5000,
    forks_count: 800,
    watchers_count: 300,
    open_issues_count: 150,
    private: false,
    fork: false,
    created_at: '2022-01-01T00:00:00Z',
    updated_at: '2024-06-01T00:00:00Z',
    has_issues: true,
    has_pull_requests: true
  }

  it('maps a full repo response', () => {
    expect(mapRepo(raw)).toEqual({
      provider: 'codeberg',
      owner: 'forgejo',
      name: 'forgejo',
      fullName: 'forgejo/forgejo',
      description: 'Beyond coding. We forge.',
      defaultBranch: 'forgejo',
      url: 'https://codeberg.org/forgejo/forgejo',
      ownerUrl: 'https://codeberg.org/forgejo',
      ownerAvatar: 'https://cb.io/o.png',
      homepage: 'https://forgejo.org',
      language: 'Go',
      topics: ['forge', 'git'],
      stars: 5000,
      forks: 800,
      watchers: 300,
      issues: 150,
      isPrivate: false,
      isFork: false,
      license: null,
      createdAt: '2022-01-01T00:00:00Z',
      updatedAt: '2024-06-01T00:00:00Z',
      features: { issues: true, pulls: true }
    })
  })

  it('builds a fallback URL from webBase when html_url is missing', () => {
    const mapped = mapRepo({ owner: { login: 'forgejo' }, name: 'forgejo' })
    expect(mapped.url).toBe('https://codeberg.org/forgejo/forgejo')
    expect(mapped.ownerUrl).toBe('https://codeberg.org/forgejo')
  })
})

describe('mapIssue', () => {
  const raw: GfIssueResponse = {
    number: 12,
    title: 'CORS missing',
    state: 'open',
    user: { login: 'someone' },
    body: 'Steps...',
    comments: 2,
    labels: ['bug', { name: 'kind/bug', color: 'ff0000', description: null }],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
    html_url: 'https://codeberg.org/forgejo/forgejo/issues/12'
  }

  it('maps an issue and normalizes string/object labels', () => {
    const mapped = mapIssue(raw)
    expect(mapped.state).toBe('open')
    expect(mapped.number).toBe(12)
    expect(mapped.labels).toEqual([
      { name: 'bug' },
      { name: 'kind/bug', color: 'ff0000', description: null }
    ])
    expect(mapped.isPull).toBe(false)
  })

  it('falls back from number to index when number is absent', () => {
    expect(mapIssue({ ...raw, number: undefined, index: 99 }).id).toBe('99')
  })

  it('flags items carrying a pull_request field as pulls', () => {
    expect(mapIssue({ ...raw, pull_request: {} }).isPull).toBe(true)
  })
})

describe('mapPull', () => {
  const raw: GfPullResponse = {
    number: 4,
    title: 'Fix flaky select',
    state: 'open',
    user: { login: 'someone' },
    body: null,
    comments: 1,
    labels: [{ name: 'ready', color: '00ff00' }],
    head: { ref: 'fix-select' },
    base: { ref: 'forgejo' },
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-03T00:00:00Z',
    html_url: 'https://codeberg.org/forgejo/forgejo/pulls/4'
  }

  it('maps an open pull request', () => {
    const mapped = mapPull(raw)
    expect(mapped.state).toBe('open')
    expect(mapped.sourceBranch).toBe('fix-select')
    expect(mapped.targetBranch).toBe('forgejo')
  })

  it('derives merged state from merged_at even if state lags', () => {
    expect(mapPull({ ...raw, merged_at: '2024-01-05T00:00:00Z' }).state).toBe('merged')
  })

  it('derives draft state only when not merged/closed', () => {
    expect(mapPull({ ...raw, draft: true }).state).toBe('draft')
  })

  it('prioritizes merged over closed over draft', () => {
    expect(mapPull({ ...raw, state: 'closed', merged: true }).state).toBe('merged')
  })
})

describe('mapEvent', () => {
  const actor = { login: 'someone' }
  const repo = { full_name: 'forgejo/forgejo', owner: { login: 'forgejo' }, name: 'forgejo' }

  it('maps a push activity, parsing sha|message commit lines', () => {
    const raw: GfActivityResponse = {
      id: 1,
      op_type: 'commit_repo',
      act_user: actor,
      repo,
      content: 'abc123|Fix bug\ndef456|Second fix',
      ref_name: 'refs/heads/forgejo',
      created: '2024-01-01T00:00:00Z'
    }
    const mapped = mapEvent(raw)
    expect(mapped?.kind).toBe('push')
    expect(mapped?.count).toBe(2)
    expect(mapped?.title).toBe('Fix bug')
    expect(mapped?.commits).toEqual([
      {
        sha: 'abc123',
        message: 'Fix bug',
        url: 'https://codeberg.org/forgejo/forgejo/commit/abc123'
      },
      {
        sha: 'def456',
        message: 'Second fix',
        url: 'https://codeberg.org/forgejo/forgejo/commit/def456'
      }
    ])
    expect(mapped?.url).toBe('https://codeberg.org/forgejo/forgejo/commit/abc123')
  })

  it('maps a merged-PR activity', () => {
    const raw: GfActivityResponse = {
      id: 2,
      op_type: 'merge_pull_request',
      act_user: actor,
      repo,
      content: 'Add feature',
      created: '2024-01-01T00:00:00Z'
    }
    const mapped = mapEvent(raw)
    expect(mapped?.kind).toBe('pr_merged')
    expect(mapped?.title).toBe('Add feature')
  })

  it('returns null when the actor or repo cannot be resolved', () => {
    const raw: GfActivityResponse = {
      id: 3,
      op_type: 'create_repo',
      act_user: null,
      repo,
      created: '2024-01-01T00:00:00Z'
    }
    expect(mapEvent(raw)).toBeNull()
  })

  it('falls back to "other" for an unrecognized op_type', () => {
    const raw: GfActivityResponse = {
      id: 4,
      op_type: 'transfer_repo',
      act_user: actor,
      repo,
      created: '2024-01-01T00:00:00Z'
    }
    expect(mapEvent(raw)?.kind).toBe('other')
  })
})
