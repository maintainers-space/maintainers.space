import { describe, expect, it, vi } from 'vitest'
import type { ForgeProvider, ForgeTreeEntry, RepoLocator } from '~/types/forge'
import { loadRepoCode } from './repo-code'

const locator: RepoLocator = { owner: 'nuxt', name: 'nuxt' }

function file(name: string): ForgeTreeEntry {
  return { name, path: name, type: 'file' }
}

/** Minimal forge: `getTree` unless `overview` provides the tree instead. */
function forge(opts: {
  tree?: ForgeTreeEntry[]
  overview?: { entries: ForgeTreeEntry[] }
}): ForgeProvider {
  const coverage = {
    getTree: opts.tree
      ? vi.fn(async (): Promise<ForgeTreeEntry[]> => opts.tree as ForgeTreeEntry[])
      : undefined,
    getOverview: opts.overview
      ? vi.fn(async (): Promise<{ repo: { defaultBranch: string }; entries: ForgeTreeEntry[] }> => {
          const o = opts.overview!
          return { repo: { defaultBranch: 'main' }, ...o }
        })
      : undefined
  } as Partial<ForgeProvider>
  return coverage as ForgeProvider
}

describe('loadRepoCode', () => {
  it('collects health files from the root tree, sorted by convention order', async () => {
    const entries = [file('CODE_OF_CONDUCT.md'), file('README.md'), file('src/main.ts')]
    const { health } = await loadRepoCode(forge({ tree: entries }), locator, 'nuxt', 'nuxt', 'main')
    expect(health.map((h) => h.key)).toEqual(['readme', 'code_of_conduct'])
    expect(health[0]).toMatchObject({ name: 'README.md', path: 'README.md' })
  })

  it('does not duplicate health files across directories (first wins)', async () => {
    const root = [
      file('README.md'),
      file('LICENSE'),
      { name: '.github', path: '.github', type: 'dir' }
    ]
    const tree = vi
      .fn()
      .mockResolvedValueOnce(root)
      .mockResolvedValueOnce([file('README.md'), file('SECURITY.md'), file('.github/action.yml')])
    const f = { getTree: tree } as Partial<ForgeProvider>
    const { health } = await loadRepoCode(f as ForgeProvider, locator, 'nuxt', 'nuxt', 'main')
    // readme+license deduped from root; security comes from .github; order by convention
    expect(health.map((h) => h.key)).toEqual(['readme', 'security', 'license'])
  })

  it('gives GOVERNANCE.md its own key instead of folding it into Support', async () => {
    const entries = [file('SUPPORT.md'), file('GOVERNANCE.md')]
    const { health } = await loadRepoCode(forge({ tree: entries }), locator, 'nuxt', 'nuxt', 'main')
    expect(health.map((h) => h.key)).toEqual(['support', 'governance'])
    expect(health.find((h) => h.key === 'governance')).toMatchObject({ name: 'GOVERNANCE.md' })
  })

  it('falls back to getOverview entries when the forge has no getTree', async () => {
    const entries = [file('CHANGELOG.md')]
    const { entries: got, health } = await loadRepoCode(
      forge({ overview: { entries } }),
      locator,
      'nuxt',
      'nuxt',
      'main'
    )
    expect(got.map((e) => e.name)).toEqual(['CHANGELOG.md'])
    expect(health.map((h) => h.key)).toEqual(['changelog'])
  })

  it('ignores files that do not match any health convention', async () => {
    const entries = [file('main.go'), file('notes.txt')]
    const { health } = await loadRepoCode(forge({ tree: entries }), locator, 'nuxt', 'nuxt', 'main')
    expect(health).toEqual([])
  })
})
