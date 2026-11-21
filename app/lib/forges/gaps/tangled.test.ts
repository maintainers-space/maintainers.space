import type { ForgeProvider, Repo, RepoRef } from 'forges'
import { describe, expect, it } from 'vitest'

import type { TangledRepoRaw } from './tangled'
import { listTangledRepos, resolveTangledRepo } from './tangled'

const DID = 'did:plc:wshs7t2adsemcrrd4snkeqli'

function repo(name: string, record: Record<string, unknown>): Repo {
  return {
    ref: {
      forge: 'tangled',
      instance: 'tangled.org',
      name,
      owner: DID,
      ownerHandle: 'tangled.org'
    },
    description: record.description as string | undefined,
    isArchived: false,
    isFork: false,
    stars: 12,
    topics: [],
    visibility: 'public',
    raw: { uri: `at://${DID}/sh.tangled.repo/${name}`, value: record }
  } as Repo
}

function provider(repos: Repo[]): ForgeProvider {
  return {
    forge: 'tangled',
    instance: 'tangled.org',
    repos: {
      get: async (ref: RepoRef) => {
        const hit = repos.find((r) => r.ref.name === ref.name)
        if (!hit) throw new Error(`no repo ${ref.owner}/${ref.name}`)
        return hit
      },
      byOwner: () => ({
        async *[Symbol.asyncIterator]() {
          yield* repos
        }
      })
    }
  } as unknown as ForgeProvider
}

describe('resolveTangledRepo', () => {
  it('reads the repo by handle and name and keeps the fields the app needs', async () => {
    const forge = provider([
      repo('core', {
        description: 'Monorepo for Tangled',
        knot: 'knot1.tangled.sh',
        name: 'core',
        spindle: 'spindle.tangled.sh'
      })
    ])

    const resolved = await resolveTangledRepo(forge, 'tangled.org', 'core')

    expect(resolved.defaultBranch).toBe('main')
    expect(resolved.description).toBe('Monorepo for Tangled')
    expect(resolved.raw).toEqual<TangledRepoRaw>({
      atUri: `at://${DID}/sh.tangled.repo/core`,
      defaultBranch: 'main',
      handle: 'tangled.org',
      knot: 'knot1.tangled.sh',
      record: {
        description: 'Monorepo for Tangled',
        knot: 'knot1.tangled.sh',
        name: 'core',
        spindle: 'spindle.tangled.sh'
      },
      spindle: 'spindle.tangled.sh',
      stars: 12
    })
  })
})

describe('listTangledRepos', () => {
  it('lists every repo of the owner, named after the record even when the key is a TID', async () => {
    const forge = provider([
      repo('core', { name: 'core' }),
      repo('3lzg6enurmo22', { name: 'knot-docker' })
    ])

    const repos = await listTangledRepos(forge, 'tangled.org')

    expect(repos.map((r) => (r.raw as TangledRepoRaw).record.name)).toEqual(['core', 'knot-docker'])
    expect(repos.map((r) => (r.raw as TangledRepoRaw).handle)).toEqual([
      'tangled.org',
      'tangled.org'
    ])
  })
})
