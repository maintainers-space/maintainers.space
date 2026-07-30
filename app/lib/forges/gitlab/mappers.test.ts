import { describe, expect, it } from 'vitest'
import { mapEvent, mapIssue, mapPull, mapRepo, mapUser } from './mappers'
import type {
  GlEventResponse,
  GlIssueResponse,
  GlMergeRequestResponse,
  GlProjectResponse
} from './types'

describe('mapUser', () => {
  it('returns undefined for a missing user', () => {
    expect(mapUser(null)).toBeUndefined()
  })

  it('maps a GitLab user, falling back to a web_url built from the username', () => {
    expect(
      mapUser({ username: 'evan', name: 'Evan You', avatar_url: 'https://gl.io/a.png' })
    ).toEqual({
      provider: 'gitlab',
      login: 'evan',
      displayName: 'Evan You',
      avatarUrl: 'https://gl.io/a.png',
      url: 'https://gitlab.com/evan'
    })
  })

  it('prefers an explicit web_url when present', () => {
    expect(mapUser({ username: 'evan', web_url: 'https://gl.example.com/evan' })?.url).toBe(
      'https://gl.example.com/evan'
    )
  })
})

describe('mapRepo', () => {
  const raw: GlProjectResponse = {
    id: 42,
    path: 'gitlab',
    path_with_namespace: 'gitlab-org/gitlab',
    description: 'The DevSecOps platform',
    default_branch: 'master',
    web_url: 'https://gitlab.com/gitlab-org/gitlab',
    namespace: {
      full_path: 'gitlab-org',
      web_url: 'https://gitlab.com/gitlab-org',
      avatar_url: 'https://gl.io/org.png'
    },
    topics: ['devops'],
    star_count: 6000,
    forks_count: 1000,
    open_issues_count: 200,
    visibility: 'public',
    license: { nickname: null, name: 'MIT License' },
    created_at: '2014-01-01T00:00:00Z',
    last_activity_at: '2024-06-01T00:00:00Z',
    issues_enabled: true,
    merge_requests_enabled: true
  }

  it('maps a full project response', () => {
    expect(mapRepo(raw)).toEqual({
      provider: 'gitlab',
      owner: 'gitlab-org',
      name: 'gitlab',
      fullName: 'gitlab-org/gitlab',
      description: 'The DevSecOps platform',
      defaultBranch: 'master',
      url: 'https://gitlab.com/gitlab-org/gitlab',
      ownerUrl: 'https://gitlab.com/gitlab-org',
      ownerAvatar: 'https://gl.io/org.png',
      homepage: null,
      language: null,
      topics: ['devops'],
      stars: 6000,
      forks: 1000,
      watchers: undefined,
      issues: 200,
      isPrivate: false,
      isFork: false,
      license: 'MIT License',
      createdAt: '2014-01-01T00:00:00Z',
      updatedAt: '2024-06-01T00:00:00Z',
      features: { issues: true, pulls: true },
      ref: { id: 42 }
    })
  })

  it('derives owner from path_with_namespace when namespace.full_path is absent', () => {
    const mapped = mapRepo({
      id: 1,
      path: 'core',
      path_with_namespace: 'vuejs/core',
      web_url: 'https://gitlab.com/vuejs/core'
    })
    expect(mapped.owner).toBe('vuejs')
  })

  it('treats any non-public visibility as private', () => {
    expect(mapRepo({ ...raw, visibility: 'private' }).isPrivate).toBe(true)
    expect(mapRepo({ ...raw, visibility: undefined }).isPrivate).toBeUndefined()
  })
})

describe('mapIssue', () => {
  const raw: GlIssueResponse = {
    iid: 15,
    title: 'Pipeline flaky',
    state: 'opened',
    author: { username: 'evan' },
    description: 'See attached ![img](/uploads/abc/screenshot.png)',
    web_url: 'https://gitlab.com/gitlab-org/gitlab/-/issues/15',
    user_notes_count: 4,
    labels: ['bug', { name: 'priority::1', color: 'ff0000', description: null }],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z'
  }

  it('maps an open issue and normalizes string/object labels', () => {
    const mapped = mapIssue(raw)
    expect(mapped.state).toBe('open')
    expect(mapped.number).toBe(15)
    expect(mapped.labels).toEqual([
      { name: 'bug' },
      { name: 'priority::1', color: 'ff0000', description: null }
    ])
    expect(mapped.isPull).toBe(false)
  })

  it('absolutizes project-relative /uploads/ links in the body', () => {
    expect(mapIssue(raw).body).toBe(
      'See attached ![img](https://gitlab.com/gitlab-org/gitlab/uploads/abc/screenshot.png)'
    )
  })

  it('treats any non-"closed" state as open', () => {
    expect(mapIssue({ ...raw, state: 'opened' }).state).toBe('open')
    expect(mapIssue({ ...raw, state: 'closed' }).state).toBe('closed')
  })
})

describe('mapPull (merge requests)', () => {
  const raw: GlMergeRequestResponse = {
    iid: 3,
    title: 'Fix flaky test',
    state: 'opened',
    author: { username: 'evan' },
    description: null,
    web_url: 'https://gitlab.com/gitlab-org/gitlab/-/merge_requests/3',
    user_notes_count: 2,
    labels: [{ name: 'ready', color: '00ff00' }],
    source_branch: 'fix-flake',
    target_branch: 'master',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-03T00:00:00Z'
  }

  it('maps an open merge request', () => {
    const mapped = mapPull(raw)
    expect(mapped.state).toBe('open')
    expect(mapped.sourceBranch).toBe('fix-flake')
    expect(mapped.targetBranch).toBe('master')
  })

  it('derives merged state from merged_at even when state lags behind', () => {
    expect(mapPull({ ...raw, merged_at: '2024-01-05T00:00:00Z' }).state).toBe('merged')
  })

  it('derives draft state from either draft or the legacy work_in_progress flag', () => {
    expect(mapPull({ ...raw, draft: true }).state).toBe('draft')
    expect(mapPull({ ...raw, work_in_progress: true }).state).toBe('draft')
  })

  it('prioritizes merged over closed over draft', () => {
    expect(mapPull({ ...raw, state: 'closed', merged_at: '2024-01-05T00:00:00Z' }).state).toBe(
      'merged'
    )
  })
})

describe('mapEvent', () => {
  const project: GlProjectResponse = {
    id: 42,
    path: 'gitlab',
    path_with_namespace: 'gitlab-org/gitlab',
    web_url: 'https://gitlab.com/gitlab-org/gitlab',
    namespace: { full_path: 'gitlab-org' }
  }
  const repoIndex = new Map([[42, project]])
  const author = { username: 'evan', name: 'Evan You' }

  it('maps a push event', () => {
    const raw: GlEventResponse = {
      id: 1,
      project_id: 42,
      created_at: '2024-01-01T00:00:00Z',
      author,
      push_data: { commit_count: 3, commit_title: 'Fix bug', ref: 'master' }
    }
    const mapped = mapEvent(raw, repoIndex)
    expect(mapped?.kind).toBe('push')
    expect(mapped?.count).toBe(3)
    expect(mapped?.title).toBe('Fix bug')
    expect(mapped?.url).toBe('https://gitlab.com/gitlab-org/gitlab/-/commits/master')
  })

  it('maps a merged-MR event', () => {
    const raw: GlEventResponse = {
      id: 2,
      project_id: 42,
      created_at: '2024-01-01T00:00:00Z',
      author,
      action_name: 'merged',
      target_type: 'MergeRequest',
      target_iid: 7,
      target_title: 'Add feature'
    }
    const mapped = mapEvent(raw, repoIndex)
    expect(mapped?.kind).toBe('pr_merged')
    expect(mapped?.number).toBe(7)
    expect(mapped?.url).toBe('https://gitlab.com/gitlab-org/gitlab/-/merge_requests/7')
  })

  it('returns null when the project cannot be resolved from the index', () => {
    const raw: GlEventResponse = {
      id: 3,
      project_id: 999,
      created_at: '2024-01-01T00:00:00Z',
      author,
      action_name: 'opened',
      target_type: 'Issue',
      target_iid: 1
    }
    expect(mapEvent(raw, repoIndex)).toBeNull()
  })

  it('returns null for an unrecognized action/target combination', () => {
    const raw: GlEventResponse = {
      id: 4,
      project_id: 42,
      created_at: '2024-01-01T00:00:00Z',
      author,
      action_name: 'left',
      target_type: null
    }
    expect(mapEvent(raw, repoIndex)).toBeNull()
  })
})
