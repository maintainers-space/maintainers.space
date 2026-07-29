import type { ForgeCommit, ForgeId, ForgeUser, Paginated } from '~/types/forge'

/**
 * Approximate a repo's contributors from its recent commit history, for
 * forges with no contributors endpoint that resolves to a clickable account
 * (GitLab's dedicated endpoint, for instance, returns git-log name/email
 * only). Dedupes by author login when the commit carries one, else by
 * name+email; caps at `limit` unique people from the default branch's most
 * recent commits.
 */
export async function deriveContributorsFromCommits(
  providerId: ForgeId,
  getDefaultBranch: () => Promise<string>,
  listCommits: (ref: string) => Promise<Paginated<ForgeCommit>>,
  limit = 8
): Promise<ForgeUser[]> {
  let commits: ForgeCommit[]
  try {
    const branch = await getDefaultBranch()
    commits = (await listCommits(branch)).items
  } catch {
    return []
  }

  const byKey = new Map<string, ForgeUser>()
  for (const c of commits) {
    const a = c.author
    if (!a) continue
    const name = a.name?.trim()
    const email = a.email?.trim()
    const key = a.login
      ? `login:${a.login.toLowerCase()}`
      : `id:${(name ?? '').toLowerCase()}:${(email ?? '').toLowerCase()}`
    if (key === 'id::' || byKey.has(key)) continue
    byKey.set(key, {
      provider: providerId,
      login: a.login ?? name ?? email ?? 'unknown',
      displayName: a.login ? undefined : (name ?? undefined),
      avatarUrl: a.avatarUrl ?? null,
      url: undefined
    })
    if (byKey.size >= limit) break
  }
  return [...byKey.values()]
}
