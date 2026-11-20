import type { Repo } from 'forges'
import { describe, expect, it } from 'vitest'
import { getRepoStats } from './repo-stats'

function repo(forge: string, raw: unknown): Repo {
  return { ref: { forge, instance: 'x', name: 'n', owner: 'o' }, raw } as Repo
}

describe('getRepoStats', () => {
  it('reads GitHub counters, language and owner avatar from the raw payload', () => {
    expect(
      getRepoStats(
        repo('github', {
          forks_count: 5,
          language: 'TypeScript',
          license: { spdx_id: 'MIT' },
          owner: { avatar_url: 'https://a/b.png' },
          stargazers_count: 10
        })
      )
    ).toEqual({
      forks: 5,
      language: 'TypeScript',
      license: 'MIT',
      ownerAvatar: 'https://a/b.png',
      stars: 10
    })
  })

  it('maps the Gitea family and GitLab star fields', () => {
    expect(getRepoStats(repo('forgejo', { stars_count: 3 })).stars).toBe(3)
    expect(getRepoStats(repo('gitlab', { star_count: 7 })).stars).toBe(7)
  })

  it('drops missing and empty values', () => {
    expect(getRepoStats(repo('github', { homepage: '', language: null }))).toEqual({})
    expect(getRepoStats(repo('unknown', {}))).toEqual({})
  })
})
