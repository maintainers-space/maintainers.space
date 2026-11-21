// GAP(forges): `Repo` has no star/fork counts, language, homepage, license or owner avatar.
// Every forge returns them, so they are read back out of the untyped `raw` payload.
import type { Repo } from 'forges'

export interface RepoStats {
  forks?: number
  homepage?: string
  language?: string
  license?: string
  ownerAvatar?: string
  stars?: number
}

type Loose = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

export function getRepoStats(repo: Repo): RepoStats {
  const raw = (repo.raw ?? {}) as Loose
  switch (repo.ref.forge) {
    case 'github':
      return clean({
        forks: raw.forks_count,
        homepage: raw.homepage,
        language: raw.language,
        license: raw.license?.spdx_id,
        ownerAvatar: raw.owner?.avatar_url,
        stars: raw.stargazers_count
      })
    case 'gitlab':
      return clean({
        forks: raw.forks_count,
        license: raw.license?.nickname,
        ownerAvatar: raw.namespace?.avatar_url ?? raw.avatar_url,
        stars: raw.star_count
      })
    case 'forgejo':
    case 'gitea':
      return clean({
        forks: raw.forks_count,
        homepage: raw.website,
        language: raw.language,
        ownerAvatar: raw.owner?.avatar_url,
        stars: raw.stars_count
      })
    case 'bitbucket':
      return clean({
        homepage: raw.website,
        language: raw.language,
        ownerAvatar: raw.owner?.links?.avatar?.href
      })
    case 'tangled':
      return clean({ homepage: raw.record?.website, stars: raw.stars })
    default:
      return {}
  }
}

function clean(stats: Record<string, unknown>): RepoStats {
  return Object.fromEntries(
    Object.entries(stats).filter(([, v]) => v !== undefined && v !== null && v !== '')
  ) as RepoStats
}
