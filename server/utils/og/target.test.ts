import { describe, expect, it } from 'vitest'

import { ogImagePath, resolveOgTarget } from './target'

describe('resolveOgTarget', () => {
  it.each([
    ['/github/nuxt/nuxt', { kind: 'repo', owner: 'nuxt', provider: 'github', repo: 'nuxt' }],
    [
      '/github/nuxt/nuxt/blob/main/README.md',
      { kind: 'repo', owner: 'nuxt', provider: 'github', repo: 'nuxt' }
    ],
    [
      '/gitlab/gitlab-org/gitlab/pulls/12',
      { id: '12', kind: 'pull', owner: 'gitlab-org', provider: 'gitlab', repo: 'gitlab' }
    ],
    [
      '/codeberg/forgejo/forgejo/issues/7',
      { id: '7', kind: 'issue', owner: 'forgejo', provider: 'codeberg', repo: 'forgejo' }
    ],
    ['/tangled/tangled.org', { kind: 'owner', owner: 'tangled.org', provider: 'tangled' }],
    ['/profile/trueberryless.org', { handle: 'trueberryless.org', kind: 'profile' }],
    ['/search', { kind: 'page', section: 'search' }],
    ['/', { kind: 'page', section: '' }],
    ['/unknown-forge/a/b', { kind: 'page', section: 'unknown-forge' }]
  ])('reads %s', (path, target) => {
    expect(resolveOgTarget(path)).toEqual(target)
  })

  it('treats a malformed escape as a plain page instead of throwing', () => {
    expect(resolveOgTarget('/github/%E0%A4%A/repo')).toEqual({ kind: 'page', section: '' })
  })
})

describe('ogImagePath', () => {
  it('gives every route of a repository the same image', () => {
    const blob = resolveOgTarget('/github/nuxt/nuxt/blob/main/README.md')
    const actions = resolveOgTarget('/github/nuxt/nuxt/actions')
    expect(ogImagePath(blob)).toBe('/_og/github/nuxt/nuxt.png')
    expect(ogImagePath(actions)).toBe('/_og/github/nuxt/nuxt.png')
  })

  it('round-trips through the image route', () => {
    for (const path of ['/gitlab/a%2Fb/c/pulls/3', '/profile/alice.bsky.social', '/', '/search']) {
      const target = resolveOgTarget(path)
      const image = ogImagePath(target)
        .replace(/^\/_og/, '')
        .replace(/\.png$/, '')
      expect(resolveOgTarget(image === '/index' ? '/' : image)).toEqual(target)
    }
  })
})
