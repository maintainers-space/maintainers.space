// Repository reads the UI shares. Every forge goes through `provider.*`; Tangled, whose provider
// has no contents or CI API yet, is bridged by ./gaps/tangled.
import type { Branch, Commit, FileContent, ForgeProvider, Repo, TreeEntry } from 'forges'

import type { TangledRepoRaw } from './gaps/tangled'
import {
  listTangledRepos,
  getTangledBranches,
  getTangledCommit,
  getTangledCommits,
  getTangledFile,
  getTangledTree,
  resolveTangledRepo
} from './gaps/tangled'

/**
 * Public repositories of an account or organisation.
 * GAP(forges): there is no `repos.listFor(owner)`; search with an owner filter is the closest
 * verb, which forges rate-limit harder and index with a delay.
 */
/** How many repositories an owner page lists; forges report no total, so a full page reads as "at least". */
export const OWNER_REPO_LIMIT = 100

export async function listOwnerRepos(provider: ForgeProvider, owner: string): Promise<Repo[]> {
  if (isTangled(provider)) return listTangledRepos(provider, owner)
  const page = await provider.search
    .repos({
      direction: 'desc',
      owner,
      perPage: OWNER_REPO_LIMIT,
      sort: 'updated'
    })
    .page()
  return page.items
}

export function isTangled(provider: ForgeProvider): boolean {
  return provider.forge === 'tangled'
}

/** The package `Repo` for a route's `owner/name`. */
export function fetchRepo(provider: ForgeProvider, owner: string, name: string): Promise<Repo> {
  if (isTangled(provider)) return resolveTangledRepo(provider, owner, name)
  return provider.repos.get({ forge: provider.forge, instance: provider.instance, name, owner })
}

export async function readTree(
  provider: ForgeProvider,
  repo: Repo,
  ref: string,
  path = ''
): Promise<TreeEntry[]> {
  if (isTangled(provider)) return getTangledTree(provider, repo.ref, ref, path)
  const entries: TreeEntry[] = []
  for await (const entry of provider.contents.tree(repo.ref, { path, ref })) entries.push(entry)
  return entries
}

export function readFile(
  provider: ForgeProvider,
  repo: Repo,
  ref: string,
  path: string
): Promise<FileContent> {
  if (isTangled(provider)) return getTangledFile(provider, repo.ref, ref, path)
  return provider.contents.getFile(repo.ref, path, { ref })
}

/** A file shaped for display: text, an image as a data URL, or opaque bytes. */
export interface BlobData {
  /** Text, or a `data:` URL for images. */
  content: string
  kind: 'text' | 'image' | 'binary'
  path: string
  size?: number
}

const IMAGE_MIME: Record<string, string> = {
  avif: 'image/avif',
  gif: 'image/gif',
  ico: 'image/x-icon',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp'
}

export async function readBlob(
  provider: ForgeProvider,
  repo: Repo,
  ref: string,
  path: string
): Promise<BlobData> {
  const file = await readFile(provider, repo, ref, path)
  if (file.encoding === 'utf-8')
    return { content: file.content, kind: 'text', path, size: file.size }
  const mime = IMAGE_MIME[path.split('.').pop()?.toLowerCase() ?? '']
  if (!mime) {
    // Forges report text as bytes unless asked; decode what is valid UTF-8.
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(file.content)
      return { content: text, kind: 'text', path, size: file.size }
    } catch {
      return { content: '', kind: 'binary', path, size: file.size }
    }
  }
  let binary = ''
  for (const byte of file.content) binary += String.fromCharCode(byte)
  return { content: `data:${mime};base64,${btoa(binary)}`, kind: 'image', path, size: file.size }
}

export async function readBranches(provider: ForgeProvider, repo: Repo): Promise<Branch[]> {
  if (isTangled(provider)) return getTangledBranches(provider, repo.ref)
  const branches: Branch[] = []
  for await (const branch of provider.contents.branches(repo.ref)) branches.push(branch)
  return branches
}

export async function readCommits(
  provider: ForgeProvider,
  repo: Repo,
  ref: string,
  limit = 30
): Promise<Commit[]> {
  if (isTangled(provider)) return getTangledCommits(provider, repo.ref, ref, limit)
  return (await provider.commits.list(repo.ref, { perPage: limit, ref }).page()).items
}

export function readCommit(provider: ForgeProvider, repo: Repo, sha: string): Promise<Commit> {
  if (isTangled(provider)) return getTangledCommit(provider, repo.ref, sha)
  return provider.commits.get({
    forge: repo.ref.forge,
    instance: repo.ref.instance,
    repo: repo.ref,
    sha
  })
}

/** What the repo can show, keyed by UI section. Tangled's bridge covers code, not threads' CI. */
export function repoSections(provider: ForgeProvider, repo?: Repo) {
  const tangled = isTangled(provider)
  const features = repo?.features
  return {
    actions:
      provider.can('ci.runs') || (tangled && !!(repo?.raw as TangledRepoRaw | undefined)?.spindle),
    code: provider.can('contents.tree') || tangled,
    discussions: provider.can('threads.list', 'discussion') && features?.discussions !== false,
    issues: provider.can('threads.list', 'issue') && features?.issues !== false,
    pulls: provider.can('threads.list', 'pull_request') && features?.pullRequests !== false
  }
}
