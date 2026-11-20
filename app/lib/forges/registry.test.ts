import { describe, expect, it } from 'vitest'
import { forgeIdOf, forgeList, getForge, isForgeId, ownerWebUrl, repoRefOf } from './registry'

describe('forge registry', () => {
  it('maps the package kind and instance back to the route id', () => {
    expect(forgeIdOf({ forge: 'forgejo', instance: 'codeberg.org' })).toBe('codeberg')
    expect(forgeIdOf({ kind: 'github', instance: 'github.com' })).toBe('github')
  })

  it('falls back to the kind for an instance it does not know', () => {
    expect(forgeIdOf({ forge: 'forgejo', instance: 'git.example.com' })).toBe('forgejo')
  })

  it('builds repo refs for route params and rejects unknown providers', () => {
    expect(repoRefOf('codeberg', 'forgejo', 'forgejo')).toEqual({
      forge: 'forgejo',
      instance: 'codeberg.org',
      name: 'forgejo',
      owner: 'forgejo'
    })
    expect(repoRefOf('nope', 'a', 'b')).toBeUndefined()
  })

  it('knows every registered id and links to account pages', () => {
    expect(forgeList.every((f) => isForgeId(f.id) && getForge(f.id))).toBe(true)
    expect(ownerWebUrl('gitlab', 'gitlab-org')).toBe('https://gitlab.com/gitlab-org')
    expect(ownerWebUrl('nope', 'x')).toBeUndefined()
  })
})
