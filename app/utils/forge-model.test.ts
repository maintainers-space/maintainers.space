import type { ThreadRef } from 'forges'
import { describe, expect, it } from 'vitest'
import { actorLabel, threadNumberOf, threadPathOf, threadRouteId, uiStateOf } from './forge-model'

const github = { forge: 'github', instance: 'github.com' } as const
const repo = { ...github, name: 'core', owner: 'vuejs' }

function ref(overrides: Partial<ThreadRef> = {}): ThreadRef {
  return { ...github, kind: 'pull_request', number: '12', repo, ...overrides }
}

describe('thread paths', () => {
  it('links pull requests, issues and discussions to their sections', () => {
    expect(threadPathOf(ref())).toBe('/github/vuejs/core/pulls/12')
    expect(threadPathOf(ref({ kind: 'issue' }))).toBe('/github/vuejs/core/issues/12')
    expect(threadPathOf(ref({ kind: 'discussion' }))).toBe('/github/vuejs/core/discussions/12')
  })

  it('addresses Tangled threads by the rkey at the end of their AT-URI', () => {
    const tangled = ref({
      forge: 'tangled',
      instance: 'tangled.org',
      number: 'at://did:plc:abc/sh.tangled.repo.pull/3mwq55',
      repo: { forge: 'tangled', instance: 'tangled.org', name: 'core', owner: 'did:plc:abc' }
    })
    expect(threadRouteId(tangled)).toBe('3mwq55')
    expect(threadNumberOf(tangled)).toBe('3mwq55')
    expect(threadNumberOf({ ...tangled, displayNumber: '42' })).toBe('42')
  })
})

describe('labels and state', () => {
  it('prefers a display name and shortens DIDs', () => {
    expect(actorLabel({ login: 'evan', name: 'Evan You' })).toBe('Evan You')
    expect(actorLabel({ login: 'did:plc:wshs7t2adsemcrrd4snkeqli' })).toBe('did:plc:wshs…eqli')
    expect(actorLabel(null)).toBe('')
  })

  it('shows an open draft as a draft', () => {
    expect(uiStateOf({ isDraft: true, state: 'open' })).toBe('draft')
    expect(uiStateOf({ isDraft: true, state: 'merged' })).toBe('merged')
  })
})
