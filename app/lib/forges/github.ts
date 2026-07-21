import type { ForgeProvider, ForgeReadOptions, ForgeRepo, ForgeTreeEntry } from '~/types/forge'

const API = 'https://api.github.com'

function ghHeaders(opts?: ForgeReadOptions): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  }
  if (opts?.token) headers.Authorization = `Bearer ${opts.token}`
  return headers
}

function decodeBase64Utf8(b64: string): string {
  const binary = atob(b64.replace(/\s/g, ''))
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function sortEntries(a: ForgeTreeEntry, b: ForgeTreeEntry): number {
  if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
  return a.name.localeCompare(b.name)
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapRepo(r: any): ForgeRepo {
  return {
    provider: 'github',
    owner: r.owner?.login ?? '',
    name: r.name,
    fullName: r.full_name ?? `${r.owner?.login ?? ''}/${r.name}`,
    description: r.description ?? null,
    defaultBranch: r.default_branch || 'main',
    url: r.html_url,
    ownerUrl: r.owner?.html_url,
    ownerAvatar: r.owner?.avatar_url ?? null,
    homepage: r.homepage || null,
    language: r.language ?? null,
    topics: r.topics ?? [],
    stars: r.stargazers_count,
    forks: r.forks_count,
    watchers: r.subscribers_count ?? r.watchers_count,
    issues: r.open_issues_count,
    isPrivate: r.private,
    isFork: r.fork,
    license: r.license?.spdx_id ?? null,
    updatedAt: r.pushed_at ?? r.updated_at ?? null
  }
}

async function getRootTree(owner: string, repo: string, opts?: ForgeReadOptions): Promise<ForgeTreeEntry[]> {
  const data = await $fetch<any>(`${API}/repos/${owner}/${repo}/contents`, {
    headers: ghHeaders(opts),
    signal: opts?.signal
  })
  const arr = Array.isArray(data) ? data : [data]
  return arr
    .map((e: any): ForgeTreeEntry => ({
      name: e.name,
      path: e.path,
      type: e.type === 'dir' ? 'dir' : 'file',
      size: e.size
    }))
    .sort(sortEntries)
}

async function getReadme(owner: string, repo: string, opts?: ForgeReadOptions) {
  try {
    const r = await $fetch<any>(`${API}/repos/${owner}/${repo}/readme`, {
      headers: ghHeaders(opts),
      signal: opts?.signal
    })
    return { filename: r.name as string, content: decodeBase64Utf8(r.content) }
  } catch {
    return null
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const githubProvider: ForgeProvider = {
  id: 'github',
  label: 'GitHub',
  icon: 'i-simple-icons-github',
  ownerLabel: 'Owner',
  ownerPlaceholder: 'e.g. vuejs',
  repoPlaceholder: 'e.g. core',
  webUrl: (owner, repo) => `https://github.com/${owner}/${repo}`,

  async getOverview(owner, repo, opts) {
    const meta = mapRepo(await $fetch(`${API}/repos/${owner}/${repo}`, {
      headers: ghHeaders(opts),
      signal: opts?.signal
    }))
    const [entries, readme] = await Promise.all([
      getRootTree(owner, repo, opts).catch(() => [] as ForgeTreeEntry[]),
      getReadme(owner, repo, opts)
    ])
    return { repo: meta, entries, readme }
  },

  async listRepos(owner, opts) {
    const data = await $fetch<unknown[]>(`${API}/users/${owner}/repos`, {
      headers: ghHeaders(opts),
      query: { per_page: 60, sort: 'updated', type: 'owner' },
      signal: opts?.signal
    })
    return data.map(mapRepo)
  }
}
