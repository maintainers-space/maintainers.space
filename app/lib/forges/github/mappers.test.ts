import { describe, expect, it } from 'vitest'
import { mapEvent, mapIssue, mapPull, mapRepo, mapUser } from './mappers'
import type { GhEventResponse, GhIssueResponse, GhPullResponse, GhRepoResponse } from './types'

describe('mapUser', () => {
  it('returns undefined for a missing user', () => {
    expect(mapUser(null)).toBeUndefined()
    expect(mapUser(undefined)).toBeUndefined()
  })

  it('maps a GitHub user into a ForgeUser', () => {
    expect(
      mapUser({
        login: 'octocat',
        avatar_url: 'https://gh.io/a.png',
        html_url: 'https://gh.io/octocat'
      })
    ).toEqual({
      provider: 'github',
      login: 'octocat',
      avatarUrl: 'https://gh.io/a.png',
      url: 'https://gh.io/octocat'
    })
  })
})

describe('mapRepo', () => {
  const raw: GhRepoResponse = {
    owner: {
      login: 'nuxt',
      html_url: 'https://github.com/nuxt',
      avatar_url: 'https://gh.io/nuxt.png'
    },
    name: 'nuxt',
    full_name: 'nuxt/nuxt',
    description: 'The full-stack Vue framework',
    default_branch: 'main',
    html_url: 'https://github.com/nuxt/nuxt',
    homepage: 'https://nuxt.com',
    language: 'TypeScript',
    topics: ['vue', 'ssr'],
    stargazers_count: 60000,
    forks_count: 5000,
    subscribers_count: 800,
    open_issues_count: 500,
    private: false,
    fork: false,
    license: { spdx_id: 'MIT' },
    created_at: '2016-01-01T00:00:00Z',
    pushed_at: '2024-06-01T00:00:00Z',
    updated_at: '2024-05-01T00:00:00Z',
    has_issues: true,
    has_discussions: true
  }

  it('maps a full repo response', () => {
    expect(mapRepo(raw)).toEqual({
      provider: 'github',
      owner: 'nuxt',
      name: 'nuxt',
      fullName: 'nuxt/nuxt',
      description: 'The full-stack Vue framework',
      defaultBranch: 'main',
      url: 'https://github.com/nuxt/nuxt',
      ownerUrl: 'https://github.com/nuxt',
      ownerAvatar: 'https://gh.io/nuxt.png',
      homepage: 'https://nuxt.com',
      language: 'TypeScript',
      topics: ['vue', 'ssr'],
      stars: 60000,
      forks: 5000,
      watchers: 800,
      issues: 500,
      isPrivate: false,
      isFork: false,
      license: 'MIT',
      createdAt: '2016-01-01T00:00:00Z',
      updatedAt: '2024-06-01T00:00:00Z',
      features: { issues: true, discussions: true }
    })
  })

  it('falls back sensibly when owner/branch/dates are missing', () => {
    const minimal: GhRepoResponse = { name: 'repo', html_url: 'https://github.com/x/repo' }
    const mapped = mapRepo(minimal)
    expect(mapped.owner).toBe('')
    expect(mapped.fullName).toBe('/repo')
    expect(mapped.defaultBranch).toBe('main')
    expect(mapped.features).toBeUndefined()
  })
})

describe('mapIssue', () => {
  const raw: GhIssueResponse = {
    number: 42,
    title: 'Something broke',
    state: 'open',
    user: { login: 'octocat' },
    body: 'Steps to reproduce...',
    comments: 3,
    labels: ['bug', { name: 'help wanted', color: 'ffffff', description: null }],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
    html_url: 'https://github.com/nuxt/nuxt/issues/42'
  }

  it('maps a plain issue, normalizing mixed string/object labels', () => {
    expect(mapIssue(raw)).toEqual({
      provider: 'github',
      id: '42',
      number: 42,
      title: 'Something broke',
      state: 'open',
      author: { provider: 'github', login: 'octocat', avatarUrl: null, url: null },
      body: 'Steps to reproduce...',
      commentCount: 3,
      labels: [{ name: 'bug' }, { name: 'help wanted', color: 'ffffff', description: null }],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-02T00:00:00Z',
      closedAt: null,
      url: 'https://github.com/nuxt/nuxt/issues/42',
      isPull: false
    })
  })

  it('flags issue-endpoint items that are actually pull requests', () => {
    expect(mapIssue({ ...raw, pull_request: { url: 'x' } }).isPull).toBe(true)
  })

  it('treats any non-"closed" state as open', () => {
    expect(mapIssue({ ...raw, state: undefined }).state).toBe('open')
  })
})

describe('mapPull', () => {
  const raw: GhPullResponse = {
    number: 7,
    title: 'Add feature',
    state: 'open',
    user: { login: 'octocat' },
    body: null,
    comments: 1,
    labels: [{ name: 'enhancement', color: '00ff00' }],
    head: { ref: 'feature-branch' },
    base: { ref: 'main' },
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-03T00:00:00Z',
    html_url: 'https://github.com/nuxt/nuxt/pull/7'
  }

  it('maps an open pull request', () => {
    const mapped = mapPull(raw)
    expect(mapped.state).toBe('open')
    expect(mapped.sourceBranch).toBe('feature-branch')
    expect(mapped.targetBranch).toBe('main')
    expect(mapped.mergedAt).toBeNull()
  })

  it('derives merged state from merged_at even if `state` still says open', () => {
    expect(mapPull({ ...raw, merged_at: '2024-01-05T00:00:00Z' }).state).toBe('merged')
  })

  it('derives draft state only when open and flagged draft', () => {
    expect(mapPull({ ...raw, draft: true }).state).toBe('draft')
  })

  it('prioritizes merged over closed over draft', () => {
    expect(mapPull({ ...raw, state: 'closed', merged: true }).state).toBe('merged')
  })
})

describe('mapEvent', () => {
  const actor = { login: 'octocat', avatar_url: 'https://gh.io/a.png' }
  const repo = { name: 'nuxt/nuxt' }

  it('maps a PushEvent, reversing commits to newest-first', () => {
    const raw: GhEventResponse = {
      id: '1',
      type: 'PushEvent',
      actor,
      repo,
      created_at: '2024-01-01T00:00:00Z',
      payload: {
        size: 2,
        head: 'def456',
        commits: [
          { sha: 'abc123', message: 'first commit' },
          { sha: 'def456', message: 'second commit\n\nlonger body' }
        ]
      }
    }
    const mapped = mapEvent(raw)
    expect(mapped?.kind).toBe('push')
    expect(mapped?.count).toBe(2)
    expect(mapped?.title).toBe('second commit')
    expect(mapped?.url).toBe('https://github.com/nuxt/nuxt/commit/def456')
    expect(mapped?.commits?.map((c) => c.sha)).toEqual(['def456', 'abc123'])
    expect(mapped?.impact).toBe(1)
  })

  it('maps a merged PullRequestEvent', () => {
    const raw: GhEventResponse = {
      id: '2',
      type: 'PullRequestEvent',
      actor,
      repo,
      created_at: '2024-01-01T00:00:00Z',
      payload: {
        action: 'closed',
        number: 7,
        pull_request: { merged: true, title: 'Add feature', html_url: 'https://gh.io/pr/7' }
      }
    }
    const mapped = mapEvent(raw)
    expect(mapped?.kind).toBe('pr_merged')
    expect(mapped?.number).toBe(7)
    expect(mapped?.impact).toBe(10)
  })

  it('maps an opened IssuesEvent', () => {
    const raw: GhEventResponse = {
      id: '3',
      type: 'IssuesEvent',
      actor,
      repo,
      created_at: '2024-01-01T00:00:00Z',
      payload: {
        action: 'opened',
        issue: { number: 9, title: 'Bug report', html_url: 'https://gh.io/i/9' }
      }
    }
    const mapped = mapEvent(raw)
    expect(mapped?.kind).toBe('issue_opened')
    expect(mapped?.number).toBe(9)
  })

  it('returns null for an unrecognized event type', () => {
    const raw: GhEventResponse = {
      id: '4',
      type: 'SomeFutureEventType',
      actor,
      repo,
      created_at: '2024-01-01T00:00:00Z'
    }
    expect(mapEvent(raw)).toBeNull()
  })

  it('returns null when the repo name cannot be split into owner/name', () => {
    const raw: GhEventResponse = {
      id: '5',
      type: 'WatchEvent',
      actor,
      repo: { name: '' },
      created_at: '2024-01-01T00:00:00Z'
    }
    expect(mapEvent(raw)).toBeNull()
  })
})
