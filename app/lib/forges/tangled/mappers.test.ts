import { describe, expect, it } from 'vitest'
import {
  didFromUri,
  makeRepo,
  mapTangledIssue,
  mapTangledPull,
  rkeyFromUri,
  tangledUser
} from './mappers'
import type { ResolvedRepo, TangledIssueRecord, TangledPullRecord } from './types'

describe('rkeyFromUri / didFromUri', () => {
  it('extracts the record key (last path segment) from an AT-URI', () => {
    expect(rkeyFromUri('at://did:plc:abc123/sh.tangled.repo.issue/3kx2p')).toBe('3kx2p')
  })

  it('extracts the DID (first path segment) from an AT-URI', () => {
    expect(didFromUri('at://did:plc:abc123/sh.tangled.repo.issue/3kx2p')).toBe('did:plc:abc123')
  })
})

describe('tangledUser', () => {
  it('builds a bare ForgeUser keyed by DID (Tangled has no separate profile fetch here)', () => {
    expect(tangledUser('did:plc:abc123')).toEqual({
      provider: 'tangled',
      login: 'did:plc:abc123',
      ref: { did: 'did:plc:abc123' }
    })
  })
})

describe('makeRepo', () => {
  const resolved: ResolvedRepo = {
    atUri: 'at://did:plc:owner/sh.tangled.repo/core',
    repoDid: 'did:plc:repo',
    knot: 'knot.tangled.org',
    spindle: 'spindle.tangled.org',
    value: {
      name: 'core',
      description: 'Monorepo for Tangled',
      website: 'https://tangled.org',
      topics: ['git'],
      createdAt: '2023-01-01T00:00:00Z'
    }
  }

  it('maps a resolved repo into a ForgeRepo', () => {
    expect(makeRepo('tangled.org', 'core', resolved)).toEqual({
      provider: 'tangled',
      owner: 'tangled.org',
      name: 'core',
      fullName: 'tangled.org/core',
      description: 'Monorepo for Tangled',
      defaultBranch: 'main',
      url: 'https://tangled.org/tangled.org/core',
      ownerUrl: 'https://tangled.org/tangled.org',
      homepage: 'https://tangled.org',
      topics: ['git'],
      createdAt: '2023-01-01T00:00:00Z',
      updatedAt: '2023-01-01T00:00:00Z',
      ref: {
        atUri: 'at://did:plc:owner/sh.tangled.repo/core',
        ownerDid: 'did:plc:owner',
        knot: 'knot.tangled.org',
        repoDid: 'did:plc:repo',
        spindle: 'spindle.tangled.org'
      }
    })
  })

  it('merges in extra overrides (e.g. defaultBranch/stars from separate calls)', () => {
    const mapped = makeRepo('tangled.org', 'core', resolved, { defaultBranch: 'master', stars: 5 })
    expect(mapped.defaultBranch).toBe('master')
    expect(mapped.stars).toBe(5)
  })

  it('falls back to the record key when value.name is absent', () => {
    const mapped = makeRepo('tangled.org', 'core', { ...resolved, value: {} })
    expect(mapped.name).toBe('core')
    expect(mapped.description).toBeNull()
  })
})

describe('mapTangledIssue', () => {
  const raw: TangledIssueRecord = {
    uri: 'at://did:plc:author/sh.tangled.repo.issue/3kx2p',
    value: { title: 'CORS missing', body: 'Details...', createdAt: '2024-01-01T00:00:00Z' },
    state: 'open',
    commentCount: 2,
    stateUpdatedAt: '2024-01-02T00:00:00Z'
  }

  it('maps an issue record, deriving id and author from the AT-URI', () => {
    expect(mapTangledIssue(raw)).toEqual({
      provider: 'tangled',
      id: '3kx2p',
      title: 'CORS missing',
      state: 'open',
      author: { provider: 'tangled', login: 'did:plc:author', ref: { did: 'did:plc:author' } },
      body: 'Details...',
      commentCount: 2,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-02T00:00:00Z',
      ref: { atUri: 'at://did:plc:author/sh.tangled.repo.issue/3kx2p' }
    })
  })

  it('treats any non-"closed" state as open, and defaults a missing title', () => {
    expect(mapTangledIssue({ ...raw, state: undefined, value: {} }).state).toBe('open')
    expect(mapTangledIssue({ ...raw, value: {} }).title).toBe('(untitled)')
  })
})

describe('mapTangledPull', () => {
  const raw: TangledPullRecord = {
    uri: 'at://did:plc:author/sh.tangled.repo.pull/3kx2q',
    value: {
      title: 'Fix flaky test',
      createdAt: '2024-01-01T00:00:00Z',
      source: { branch: 'fix-flake' },
      target: { branch: 'master' }
    },
    state: 'open',
    commentCount: 1,
    stateUpdatedAt: '2024-01-03T00:00:00Z'
  }

  it('maps an open pull record', () => {
    const mapped = mapTangledPull(raw)
    expect(mapped.state).toBe('open')
    expect(mapped.sourceBranch).toBe('fix-flake')
    expect(mapped.targetBranch).toBe('master')
  })

  it('maps merged/closed states directly from the state field', () => {
    expect(mapTangledPull({ ...raw, state: 'merged' }).state).toBe('merged')
    expect(mapTangledPull({ ...raw, state: 'closed' }).state).toBe('closed')
  })

  it('falls back to the `status` field when `state` is absent', () => {
    expect(mapTangledPull({ ...raw, state: undefined, status: 'merged' }).state).toBe('merged')
  })
})
