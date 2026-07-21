import { resolveHandleToDid } from '~/lib/atproto/public'
import type { ForgeProvider, ForgeReadOptions, ForgeRepo, ForgeTreeEntry } from '~/types/forge'

// Bobbin: Tangled's read-only, CORS-friendly XRPC aggregator that accepts AT-URIs.
const BOBBIN = 'https://api.tangled.org/xrpc'

interface TangledRepoValue {
  $type?: string
  name?: string
  knot?: string
  spindle?: string
  repoDid?: string
  description?: string
  website?: string
  topics?: string[]
  source?: string
  createdAt?: string
}

interface TangledListItem {
  uri: string
  cid?: string
  value: TangledRepoValue
}

interface TangledTree {
  ref?: string
  readme?: { filename?: string, contents?: string } | null
  files?: Array<{
    name: string
    mode: string
    size?: number
    last_commit?: { message?: string, when?: string, hash?: string }
  }>
}

function rkeyFromUri(uri: string): string {
  return uri.split('/').pop() ?? ''
}

// Git mode 0040000 == directory.
function isDirMode(mode: string): boolean {
  return typeof mode === 'string' && mode.startsWith('004')
}

function sortEntries(a: ForgeTreeEntry, b: ForgeTreeEntry): number {
  if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
  return a.name.localeCompare(b.name)
}

async function listRepoRecords(did: string, opts?: ForgeReadOptions): Promise<TangledListItem[]> {
  const data = await $fetch<{ items?: TangledListItem[] }>(`${BOBBIN}/sh.tangled.repo.listRepos`, {
    query: { subject: did, limit: 100 },
    signal: opts?.signal
  })
  return data.items ?? []
}

async function getDefaultBranch(atUri: string, opts?: ForgeReadOptions): Promise<string> {
  try {
    const data = await $fetch<{ name?: string }>(`${BOBBIN}/sh.tangled.repo.getDefaultBranch`, {
      query: { repo: atUri },
      signal: opts?.signal
    })
    return data.name || 'main'
  } catch {
    return 'main'
  }
}

async function countStars(atUri: string, opts?: ForgeReadOptions): Promise<number | undefined> {
  try {
    const data = await $fetch<{ count?: number }>(`${BOBBIN}/sh.tangled.feed.countStars`, {
      query: { subject: atUri },
      signal: opts?.signal
    })
    return data.count
  } catch {
    return undefined
  }
}

export const tangledProvider: ForgeProvider = {
  id: 'tangled',
  label: 'Tangled',
  icon: 'i-lucide-git-branch',
  ownerLabel: 'Handle',
  ownerPlaceholder: 'e.g. tangled.org',
  repoPlaceholder: 'e.g. core',
  webUrl: (owner, repo) => `https://tangled.org/${owner}/${repo}`,

  async getOverview(owner, repo, opts) {
    const did = await resolveHandleToDid(owner)
    const items = await listRepoRecords(did, opts)
    // New-style records use the repo name as rkey; legacy ones set value.name.
    const match = items.find((it) => it.value?.name === repo) ?? items.find((it) => rkeyFromUri(it.uri) === repo)
    if (!match) {
      throw createError({
        statusCode: 404,
        statusMessage: `Repository "${repo}" was not found on Tangled for ${owner}.`
      })
    }

    const atUri = match.uri
    const value = match.value ?? {}
    const branch = await getDefaultBranch(atUri, opts)
    const [tree, stars] = await Promise.all([
      $fetch<TangledTree>(`${BOBBIN}/sh.tangled.repo.tree`, {
        query: { repo: atUri, ref: branch },
        signal: opts?.signal
      }),
      countStars(atUri, opts)
    ])

    const entries: ForgeTreeEntry[] = (tree.files ?? [])
      .map((f): ForgeTreeEntry => ({
        name: f.name,
        path: f.name,
        type: isDirMode(f.mode) ? 'dir' : 'file',
        size: f.size,
        lastCommit: f.last_commit
          ? { message: f.last_commit.message, when: f.last_commit.when, hash: f.last_commit.hash }
          : undefined
      }))
      .sort(sortEntries)

    const repoName = value.name || repo
    const forgeRepo: ForgeRepo = {
      provider: 'tangled',
      owner,
      name: repoName,
      fullName: `${owner}/${repoName}`,
      description: value.description ?? null,
      defaultBranch: tree.ref || branch,
      url: `https://tangled.org/${owner}/${repo}`,
      ownerUrl: `https://tangled.org/${owner}`,
      homepage: value.website ?? null,
      topics: value.topics ?? [],
      stars,
      updatedAt: value.createdAt ?? null,
      ref: { atUri, knot: value.knot, repoDid: value.repoDid }
    }

    const readme = tree.readme?.contents
      ? { filename: tree.readme.filename || 'README', content: tree.readme.contents }
      : null

    return { repo: forgeRepo, entries, readme }
  },

  async listRepos(owner, opts) {
    const did = await resolveHandleToDid(owner)
    const items = await listRepoRecords(did, opts)
    return items.map((it): ForgeRepo => {
      const value = it.value ?? {}
      const name = value.name || rkeyFromUri(it.uri)
      return {
        provider: 'tangled',
        owner,
        name,
        fullName: `${owner}/${name}`,
        description: value.description ?? null,
        defaultBranch: 'main',
        url: `https://tangled.org/${owner}/${name}`,
        ownerUrl: `https://tangled.org/${owner}`,
        homepage: value.website ?? null,
        topics: value.topics ?? [],
        updatedAt: value.createdAt ?? null,
        ref: { atUri: it.uri, knot: value.knot, repoDid: value.repoDid }
      }
    })
  }
}
