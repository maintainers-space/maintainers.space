import type { ForgeProvider, Repo, TreeEntry } from 'forges'
import { describe, expect, it, vi } from 'vitest'
import { loadRepoCode } from './repo-code'

const repo = {
  ref: { forge: 'github', instance: 'github.com', name: 'nuxt', owner: 'nuxt' }
} as Repo

function file(path: string): TreeEntry {
  return { path, type: 'file' }
}

function dir(path: string): TreeEntry {
  return { path, type: 'directory' }
}

/** A provider whose `contents.tree` yields each listing in turn, one per call. */
function forge(...listings: TreeEntry[][]): ForgeProvider {
  const tree = vi.fn()
  for (const listing of listings) {
    tree.mockImplementationOnce(async function* () {
      yield* listing
    })
  }
  return { contents: { tree }, kind: 'github', instance: 'github.com' } as unknown as ForgeProvider
}

describe('loadRepoCode', () => {
  it('collects health files from the root tree, sorted by convention order', async () => {
    const entries = [file('CODE_OF_CONDUCT.md'), file('README.md'), file('src/main.ts')]
    const { health } = await loadRepoCode(forge(entries), repo, 'main')
    expect(health.map((h) => h.key)).toEqual(['readme', 'code_of_conduct'])
    expect(health[0]).toMatchObject({ name: 'README.md', path: 'README.md' })
  })

  it('does not duplicate health files across directories (first wins)', async () => {
    const root = [file('README.md'), file('LICENSE'), dir('.github')]
    const github = [file('.github/README.md'), file('.github/SECURITY.md')]
    const { health } = await loadRepoCode(forge(root, github), repo, 'main')
    // readme+license deduped from root; security comes from .github; order by convention
    expect(health.map((h) => h.key)).toEqual(['readme', 'security', 'license'])
  })

  it('gives GOVERNANCE.md its own key instead of folding it into Support', async () => {
    const { health } = await loadRepoCode(
      forge([file('SUPPORT.md'), file('GOVERNANCE.md')]),
      repo,
      'main'
    )
    expect(health.map((h) => h.key)).toEqual(['support', 'governance'])
    expect(health.find((h) => h.key === 'governance')).toMatchObject({ name: 'GOVERNANCE.md' })
  })

  it('ignores files that do not match any health convention', async () => {
    const { health } = await loadRepoCode(forge([file('main.go'), file('notes.txt')]), repo, 'main')
    expect(health).toEqual([])
  })
})
