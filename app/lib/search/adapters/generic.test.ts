import { describe, expect, it } from 'vitest'
import { parseQuery } from '~/lib/search/parser'
import { astToClientFilterPlan, clientFilterMatches } from './generic'

const opts = { ownerKeys: ['owner', 'user', 'workspace'] }

describe('astToClientFilterPlan', () => {
  it('is unusable without an owner-scoping qualifier', () => {
    const { root } = parseQuery('nuxt')
    const plan = astToClientFilterPlan(root, opts)
    expect(plan.usable).toBe(false)
    expect(plan.terms).toEqual(['nuxt'])
  })

  it('resolves the owner from any configured owner key', () => {
    const { root } = parseQuery('owner:nuxt vite')
    const plan = astToClientFilterPlan(root, opts)
    expect(plan.usable).toBe(true)
    expect(plan.owner).toBe('nuxt')
    expect(plan.terms).toEqual(['vite'])
  })

  it('keeps the first owner key seen when multiple are present', () => {
    const { root } = parseQuery('owner:nuxt user:vuejs')
    const plan = astToClientFilterPlan(root, opts)
    expect(plan.owner).toBe('nuxt')
  })

  it('splits an owner/repo qualifier into owner + repoName', () => {
    const { root } = parseQuery('repo:nuxt/nuxt')
    const plan = astToClientFilterPlan(root, opts)
    expect(plan.owner).toBe('nuxt')
    expect(plan.repoName).toBe('nuxt')
    expect(plan.usable).toBe(true)
  })

  it('treats a bare repo qualifier as just a repo name, not owner-scoping', () => {
    const { root } = parseQuery('repo:nuxt')
    const plan = astToClientFilterPlan(root, opts)
    expect(plan.owner).toBeUndefined()
    expect(plan.repoName).toBe('nuxt')
    expect(plan.usable).toBe(false)
  })

  it('collects negated terms separately from positive terms', () => {
    const { root } = parseQuery('owner:nuxt vite -webpack')
    const plan = astToClientFilterPlan(root, opts)
    expect(plan.terms).toEqual(['vite'])
    expect(plan.negatedTerms).toEqual(['webpack'])
  })

  it('resolves state from is:/state: with a recognized value only', () => {
    const open = astToClientFilterPlan(parseQuery('owner:nuxt is:open').root, opts)
    expect(open.state).toBe('open')

    const bogus = astToClientFilterPlan(parseQuery('owner:nuxt is:bogus').root, opts)
    expect(bogus.state).toBeUndefined()
  })
})

describe('clientFilterMatches', () => {
  it('matches when every positive term is present and no negated term is', () => {
    const plan = astToClientFilterPlan(parseQuery('owner:nuxt bug fix').root, opts)
    expect(clientFilterMatches(plan, 'Fix bug in router', 'body text')).toBe(true)
  })

  it('fails when a positive term is missing', () => {
    const plan = astToClientFilterPlan(parseQuery('owner:nuxt bug').root, opts)
    expect(clientFilterMatches(plan, 'unrelated title')).toBe(false)
  })

  it('fails when a negated term is present', () => {
    const plan = astToClientFilterPlan(parseQuery('owner:nuxt -flaky').root, opts)
    expect(clientFilterMatches(plan, 'flaky test failure')).toBe(false)
  })

  it('ignores null/undefined fields when building the haystack', () => {
    const plan = astToClientFilterPlan(parseQuery('owner:nuxt bug').root, opts)
    expect(clientFilterMatches(plan, 'a bug', null, undefined)).toBe(true)
  })
})
