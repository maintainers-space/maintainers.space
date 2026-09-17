import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ForgeRepo } from '~/types/forge'
import { useRepoVisits } from './useRepoVisits'
import { clearOfflineState, useOfflineRepos } from './useOfflineRepos'

function repo(owner: string): Pick<ForgeRepo, 'provider' | 'owner' | 'name' | 'fullName'> {
  return { provider: 'github', owner, name: 'repo', fullName: `${owner}/repo` }
}

beforeEach(() => {
  clearOfflineState()
  useRepoVisits().clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('offline candidates', () => {
  it('prioritizes an opened item over a newer ordinary repo visit', () => {
    const { record } = useRepoVisits()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-01T00:00:00Z'))
    record(repo('item-repo'))
    vi.setSystemTime(new Date('2024-06-02T00:00:00Z'))
    record(repo('newer-repo'))

    const offline = useOfflineRepos()
    offline.watch('issue', 'github', 'item-repo', 'repo', '1')

    expect(offline.candidates().slice(0, 2)).toMatchObject([
      { provider: 'github', owner: 'item-repo', name: 'repo' },
      { provider: 'github', owner: 'newer-repo', name: 'repo' }
    ])
  })
})
