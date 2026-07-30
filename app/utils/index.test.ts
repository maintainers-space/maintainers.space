import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  encodePathSegments,
  formatBytes,
  formatCompactNumber,
  formatDate,
  formatDuration,
  formatRelativeTime,
  issuePath,
  pullsTerm,
  repoPath,
  shortDid,
  userLabel,
  userPath
} from './index'

describe('formatCompactNumber', () => {
  it('returns "0" for null/undefined', () => {
    expect(formatCompactNumber(null)).toBe('0')
    expect(formatCompactNumber(undefined)).toBe('0')
  })

  it('leaves small numbers uncompacted', () => {
    expect(formatCompactNumber(999)).toBe('999')
  })

  it('compacts thousands and millions with at most one decimal', () => {
    expect(formatCompactNumber(1234)).toBe('1.2K')
    expect(formatCompactNumber(1000000)).toBe('1M')
    expect(formatCompactNumber(1500000)).toBe('1.5M')
  })
})

describe('formatBytes', () => {
  it('returns an empty string for falsy or negative input', () => {
    expect(formatBytes(0)).toBe('')
    expect(formatBytes(undefined)).toBe('')
    expect(formatBytes(-5)).toBe('')
  })

  it('formats sub-1024 values as whole bytes', () => {
    expect(formatBytes(500)).toBe('500 B')
  })

  it('scales up through KB/MB, rounding to 1 decimal under 10 units', () => {
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
  })

  it('drops the decimal once the value reaches double digits', () => {
    expect(formatBytes(12 * 1024)).toBe('12 KB')
  })
})

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns an empty string for null/undefined/invalid input', () => {
    expect(formatRelativeTime(null)).toBe('')
    expect(formatRelativeTime(undefined)).toBe('')
    expect(formatRelativeTime('not a date')).toBe('')
  })

  it('renders "now" for the current instant', () => {
    expect(formatRelativeTime('2024-01-15T12:00:00Z')).toBe('now')
  })

  it('renders a past hour offset', () => {
    expect(formatRelativeTime('2024-01-15T10:00:00Z')).toBe('2 hours ago')
  })

  it('renders a future minute offset', () => {
    expect(formatRelativeTime('2024-01-15T12:03:00Z')).toBe('in 3 minutes')
  })

  it('renders exactly one day ago as "yesterday"', () => {
    expect(formatRelativeTime('2024-01-14T12:00:00Z')).toBe('yesterday')
  })
})

describe('formatDuration', () => {
  it('returns an empty string when either timestamp is missing', () => {
    expect(formatDuration(undefined, '2024-01-01T00:00:10Z')).toBe('')
    expect(formatDuration('2024-01-01T00:00:00Z', undefined)).toBe('')
  })

  it('returns an empty string when completedAt precedes startedAt', () => {
    expect(formatDuration('2024-01-01T00:00:10Z', '2024-01-01T00:00:00Z')).toBe('')
  })

  it('formats sub-minute durations as seconds', () => {
    expect(formatDuration('2024-01-01T00:00:00Z', '2024-01-01T00:00:45Z')).toBe('45s')
  })

  it('formats minute-scale durations, omitting a zero seconds remainder', () => {
    expect(formatDuration('2024-01-01T00:00:00Z', '2024-01-01T00:02:05Z')).toBe('2m 5s')
    expect(formatDuration('2024-01-01T00:00:00Z', '2024-01-01T00:02:00Z')).toBe('2m')
  })

  it('formats hour-scale durations as "Xh Ym"', () => {
    expect(formatDuration('2024-01-01T00:00:00Z', '2024-01-01T01:02:05Z')).toBe('1h 2m')
  })
})

describe('formatDate', () => {
  it('returns an empty string for null/undefined/invalid input', () => {
    expect(formatDate(null)).toBe('')
    expect(formatDate(undefined)).toBe('')
    expect(formatDate('not a date')).toBe('')
  })

  it('formats a valid date in medium style', () => {
    expect(formatDate('2024-03-15T12:00:00Z')).toBe('Mar 15, 2024')
  })
})

describe('shortDid', () => {
  it('returns an empty string for a falsy input', () => {
    expect(shortDid(null)).toBe('')
    expect(shortDid(undefined)).toBe('')
  })

  it('returns non-DID strings unchanged', () => {
    expect(shortDid('not-a-did')).toBe('not-a-did')
  })

  it('returns short DIDs unchanged', () => {
    expect(shortDid('did:plc:short')).toBe('did:plc:short')
  })

  it('truncates a long DID to prefix + 4 chars … 4 chars', () => {
    expect(shortDid('did:plc:wshs7t2adsemcrrd4snkeqli')).toBe('did:plc:wshs…eqli')
  })
})

describe('userLabel', () => {
  it('returns an empty string for a null user', () => {
    expect(userLabel(null)).toBe('')
  })

  it('prefers displayName when present', () => {
    expect(userLabel({ login: 'evan', displayName: 'Evan You' })).toBe('Evan You')
  })

  it('shortens a DID-style login when there is no displayName', () => {
    expect(userLabel({ login: 'did:plc:wshs7t2adsemcrrd4snkeqli' })).toBe('did:plc:wshs…eqli')
  })

  it('falls back to the plain login', () => {
    expect(userLabel({ login: 'evan' })).toBe('evan')
  })
})

describe('encodePathSegments', () => {
  it('percent-encodes each segment while preserving slashes', () => {
    expect(encodePathSegments('a b/c#d')).toBe('a%20b/c%23d')
  })

  it('drops empty segments from leading/trailing/double slashes', () => {
    expect(encodePathSegments('/a//b/')).toBe('a/b')
  })
})

describe('repoPath', () => {
  it('builds the base repo path', () => {
    expect(repoPath({ provider: 'github', owner: 'nuxt', name: 'nuxt' })).toBe('/github/nuxt/nuxt')
  })

  it('appends a sub-path, stripping a leading slash', () => {
    expect(repoPath({ provider: 'github', owner: 'nuxt', name: 'nuxt' }, '/issues')).toBe(
      '/github/nuxt/nuxt/issues'
    )
  })

  it('percent-encodes owner/name segments', () => {
    expect(repoPath({ provider: 'github', owner: 'my org', name: 'repo' })).toBe(
      '/github/my%20org/repo'
    )
  })
})

describe('userPath', () => {
  it('builds a user profile path', () => {
    expect(userPath({ provider: 'github', login: 'evan' })).toBe('/github/evan')
  })
})

describe('pullsTerm', () => {
  it('calls it "merge request" on GitLab and "pull request" elsewhere', () => {
    expect(pullsTerm('gitlab')).toBe('merge request')
    expect(pullsTerm('github')).toBe('pull request')
  })

  it('pluralizes on request', () => {
    expect(pullsTerm('gitlab', { plural: true })).toBe('merge requests')
    expect(pullsTerm('github', { plural: true })).toBe('pull requests')
  })

  it('capitalizes the first letter on request, after pluralizing', () => {
    expect(pullsTerm('github', { capitalize: true })).toBe('Pull request')
    expect(pullsTerm('gitlab', { plural: true, capitalize: true })).toBe('Merge requests')
  })
})

describe('issuePath', () => {
  it('returns "#" when the issue has no repo', () => {
    expect(issuePath({ provider: 'github', id: '1' })).toBe('#')
  })

  it('routes to /issues for a plain issue', () => {
    expect(issuePath({ provider: 'github', id: '42', repo: { owner: 'nuxt', name: 'nuxt' } })).toBe(
      '/github/nuxt/nuxt/issues/42'
    )
  })

  it('routes to /pulls when isPull is true', () => {
    expect(
      issuePath({
        provider: 'github',
        id: '42',
        isPull: true,
        repo: { owner: 'nuxt', name: 'nuxt' }
      })
    ).toBe('/github/nuxt/nuxt/pulls/42')
  })
})
