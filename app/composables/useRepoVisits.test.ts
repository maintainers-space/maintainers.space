import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ForgeRepo } from '~/types/forge'
import { useRepoVisits } from './useRepoVisits'

const STORAGE_KEY = 'maintainers.space:repo-visits'

function repo(
  overrides: Partial<
    Pick<
      ForgeRepo,
      'provider' | 'owner' | 'name' | 'fullName' | 'description' | 'language' | 'stars'
    >
  > = {}
) {
  return {
    provider: 'github',
    owner: 'nuxt',
    name: 'nuxt',
    fullName: 'nuxt/nuxt',
    description: 'The full-stack Vue framework',
    language: 'TypeScript',
    stars: 1000,
    ...overrides
  }
}

beforeEach(() => {
  useRepoVisits().clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('record', () => {
  it('creates a new visit entry on first record', () => {
    const { record, recent } = useRepoVisits()
    record(repo())
    expect(recent.value).toHaveLength(1)
    expect(recent.value[0]).toMatchObject({
      provider: 'github',
      owner: 'nuxt',
      name: 'nuxt',
      count: 1
    })
  })

  it('increments count and refreshes lastVisit on repeat visits', () => {
    const { record, recent } = useRepoVisits()
    record(repo())
    const first = recent.value[0]!.lastVisit

    vi.useFakeTimers()
    vi.setSystemTime(first + 60_000)
    record(repo())

    expect(recent.value[0]!.count).toBe(2)
    expect(recent.value[0]!.lastVisit).toBe(first + 60_000)
  })

  it('preserves description/language/stars from the previous visit when omitted', () => {
    const { record, recent } = useRepoVisits()
    record(repo())
    record(repo({ description: undefined, language: undefined, stars: undefined }))
    expect(recent.value[0]).toMatchObject({
      description: 'The full-stack Vue framework',
      language: 'TypeScript',
      stars: 1000
    })
  })

  it('ignores repos missing an owner or name', () => {
    const { record, hasVisits } = useRepoVisits()
    record(repo({ owner: '', name: '' }))
    expect(hasVisits.value).toBe(false)
  })
})

describe('recordSection', () => {
  it('is a no-op for a repo that has not been visited yet', () => {
    const { recordSection, recent } = useRepoVisits()
    recordSection({ provider: 'github', owner: 'nuxt', name: 'nuxt' }, 'issues')
    expect(recent.value).toHaveLength(0)
  })

  it('increments the per-section counter for an already-visited repo', () => {
    const { record, recordSection, recent } = useRepoVisits()
    record(repo())
    const ref = { provider: 'github', owner: 'nuxt', name: 'nuxt' }
    recordSection(ref, 'issues')
    recordSection(ref, 'issues')
    recordSection(ref, 'pulls')
    expect(recent.value[0]!.sections).toEqual({ issues: 2, pulls: 1 })
  })
})

describe('clear', () => {
  it('empties all visits and persists the reset', () => {
    const { record, clear, hasVisits } = useRepoVisits()
    record(repo())
    expect(hasVisits.value).toBe(true)
    clear()
    expect(hasVisits.value).toBe(false)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')).toEqual({})
  })
})

describe('recent', () => {
  it('sorts by most recently visited first', () => {
    const { record, recent } = useRepoVisits()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-01T00:00:00Z'))
    record(repo({ owner: 'older', name: 'repo', fullName: 'older/repo' }))
    vi.setSystemTime(new Date('2024-06-02T00:00:00Z'))
    record(repo({ owner: 'newer', name: 'repo', fullName: 'newer/repo' }))

    expect(recent.value.map((v) => v.owner)).toEqual(['newer', 'older'])
  })
})

describe('favourites', () => {
  it('ranks a more recently visited repo above an equally-visited older one', () => {
    const { record, favourites } = useRepoVisits()
    const now = new Date('2024-06-01T00:00:00Z').getTime()

    vi.useFakeTimers()
    vi.setSystemTime(now - 60 * 86_400_000)
    record(repo({ owner: 'old', name: 'repo', fullName: 'old/repo' }))
    vi.setSystemTime(now - 10 * 86_400_000)
    record(repo({ owner: 'recent', name: 'repo', fullName: 'recent/repo' }))

    vi.setSystemTime(now)
    expect(favourites.value.map((v) => v.owner)).toEqual(['recent', 'old'])
  })

  it('ranks a more-visited repo above a once-visited repo of the same age', () => {
    const { record, favourites } = useRepoVisits()
    const now = new Date('2024-06-01T00:00:00Z').getTime()

    vi.useFakeTimers()
    vi.setSystemTime(now - 30 * 86_400_000)
    for (let i = 0; i < 5; i++)
      record(repo({ owner: 'frequent', name: 'repo', fullName: 'frequent/repo' }))
    record(repo({ owner: 'rare', name: 'repo', fullName: 'rare/repo' }))

    vi.setSystemTime(now)
    expect(favourites.value.map((v) => v.owner)).toEqual(['frequent', 'rare'])
  })
})

describe('jumpBackIn', () => {
  it('ranks a repo with broader section engagement above an equally-visited, equally-recent one', () => {
    const { record, recordSection, jumpBackIn } = useRepoVisits()
    const engagedRef = { provider: 'github', owner: 'engaged', name: 'repo' }

    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-01T00:00:00Z'))
    record(repo({ owner: 'engaged', name: 'repo', fullName: 'engaged/repo' }))
    recordSection(engagedRef, 'issues')
    recordSection(engagedRef, 'pulls')
    recordSection(engagedRef, 'actions')
    record(repo({ owner: 'shallow', name: 'repo', fullName: 'shallow/repo' }))

    expect(jumpBackIn.value.map((v) => v.owner)).toEqual(['engaged', 'shallow'])
  })
})

describe('persistence', () => {
  it('writes visits to localStorage under the shared key', () => {
    const { record } = useRepoVisits()
    record(repo())
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    expect(stored['github/nuxt/nuxt']).toMatchObject({ owner: 'nuxt', name: 'nuxt', count: 1 })
  })
})
