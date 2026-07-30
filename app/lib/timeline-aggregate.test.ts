import { describe, expect, it } from 'vitest'
import type { ForgeContribution } from '~/types/forge'
import { aggregateTimeline, totalCommitCount } from './timeline-aggregate'

const repo = { owner: 'nuxt', name: 'nuxt', fullName: 'nuxt/nuxt' }
const actor = { provider: 'github' as const, login: 'evan' }

function contribution(overrides: Partial<ForgeContribution> & { id: string }): ForgeContribution {
  return {
    provider: 'github',
    kind: 'push',
    actor,
    repo,
    createdAt: '2024-01-01T12:00:00Z',
    ...overrides
  }
}

// Constructed from local Y/M/D/H/M components (not hardcoded UTC strings) so
// "same local day" and "different local day" hold regardless of which
// timezone the test happens to run in — sameCalendarDay compares local
// getFullYear/getMonth/getDate, so fixtures and assertions must agree on
// whatever that local day boundary is.
function localTime(year: number, month: number, day: number, hour: number, minute: number) {
  return new Date(year, month, day, hour, minute).toISOString()
}

describe('aggregateTimeline', () => {
  it('merges every event for the same subject (issue/PR number) into one entry', () => {
    const closed = contribution({
      id: 'closed',
      kind: 'issue_closed',
      number: 42,
      createdAt: '2024-01-05T00:00:00Z',
      impact: 5
    })
    const opened = contribution({
      id: 'opened',
      kind: 'issue_opened',
      number: 42,
      createdAt: '2024-01-01T00:00:00Z',
      impact: 2
    })

    const [entry] = aggregateTimeline([closed, opened])
    expect(entry).toBeDefined()
    expect(entry!.events).toEqual([closed, opened])
    expect(entry!.primary).toBe(closed)
    expect(entry!.createdAt).toBe(closed.createdAt)
  })

  it('merges subject-less bursts (e.g. pushes) that land on the same local day', () => {
    const p1 = contribution({ id: 'p1', createdAt: localTime(2024, 0, 1, 20, 0) })
    const p2 = contribution({ id: 'p2', createdAt: localTime(2024, 0, 1, 8, 0) })

    const entries = aggregateTimeline([p1, p2])
    expect(entries).toHaveLength(1)
    expect(entries[0]!.events).toEqual([p1, p2])
  })

  it('splits a burst into separate entries once events cross a local day boundary, even close in time', () => {
    const p1 = contribution({ id: 'p1', createdAt: localTime(2024, 0, 2, 0, 5), impact: 1 })
    const p2 = contribution({ id: 'p2', createdAt: localTime(2024, 0, 1, 23, 55), impact: 5 })
    const p3 = contribution({ id: 'p3', createdAt: localTime(2024, 0, 1, 9, 0), impact: 2 })

    const entries = aggregateTimeline([p1, p2, p3])
    expect(entries).toHaveLength(2)
    expect(entries[0]!.events).toEqual([p1])
    expect(entries[1]!.events).toEqual([p2, p3])
    expect(entries[1]!.primary).toBe(p2)
  })

  it('never merges events from different repos or actors into the same burst', () => {
    const mine = contribution({ id: 'mine', createdAt: '2024-01-01T12:00:00Z' })
    const otherRepo = contribution({
      id: 'other-repo',
      createdAt: '2024-01-01T12:01:00Z',
      repo: { owner: 'vuejs', name: 'core', fullName: 'vuejs/core' }
    })
    const otherActor = contribution({
      id: 'other-actor',
      createdAt: '2024-01-01T12:02:00Z',
      actor: { provider: 'github', login: 'someone-else' }
    })

    const entries = aggregateTimeline([otherActor, otherRepo, mine])
    expect(entries).toHaveLength(3)
  })

  it('returns an empty list for empty input', () => {
    expect(aggregateTimeline([])).toEqual([])
  })
})

describe('totalCommitCount', () => {
  it('sums each event’s count field', () => {
    const entries = aggregateTimeline([
      contribution({ id: 'p1', count: 3, createdAt: localTime(2024, 0, 1, 12, 0) }),
      contribution({ id: 'p2', count: 2, createdAt: localTime(2024, 0, 1, 11, 30) })
    ])
    expect(totalCommitCount(entries[0]!)).toBe(5)
  })

  it('falls back to commits.length when count is absent', () => {
    const entries = aggregateTimeline([
      contribution({
        id: 'p1',
        createdAt: localTime(2024, 0, 1, 12, 0),
        commits: [{ message: 'a' }, { message: 'b' }]
      })
    ])
    expect(totalCommitCount(entries[0]!)).toBe(2)
  })

  it('takes whichever of count/commits.length is larger, per event', () => {
    // A forge might report an approximate count while trimming the actual
    // commit list, or vice versa — never let the smaller number win.
    const entries = aggregateTimeline([
      contribution({
        id: 'p1',
        count: 1,
        createdAt: localTime(2024, 0, 1, 12, 0),
        commits: [{ message: 'a' }, { message: 'b' }, { message: 'c' }]
      })
    ])
    expect(totalCommitCount(entries[0]!)).toBe(3)
  })

  it('never reports a nonzero count when neither count nor commits is known', () => {
    const entries = aggregateTimeline([
      contribution({ id: 'p1', createdAt: localTime(2024, 0, 1, 12, 0) })
    ])
    expect(totalCommitCount(entries[0]!)).toBe(0)
  })
})
