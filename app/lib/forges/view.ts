// Flat, JSON-safe summaries of package models. Visit history, offline pins and the response
// cache persist these, so they must not carry `raw` payloads or `Date`s.
import type { Repo } from 'forges'

import { forgeIdOf } from './registry'
import type { TangledRepoRaw } from './gaps/tangled'
import { getRepoStats } from './gaps/repo-stats'

export interface RepoCard {
  description?: string
  forks?: number
  fullName: string
  homepage?: string
  isFork: boolean
  isPrivate: boolean
  language?: string
  name: string
  owner: string
  ownerAvatar?: string
  provider: string
  stars?: number
  topics: string[]
  updatedAt?: string
  url: string
}

export function toRepoCard(repo: Repo): RepoCard {
  const stats = getRepoStats(repo)
  const tangled = repo.ref.forge === 'tangled' ? (repo.raw as TangledRepoRaw) : undefined
  const owner = tangled?.handle ?? repo.ref.owner
  const name = tangled?.record.name ?? repo.ref.name
  return {
    description: repo.description,
    forks: stats.forks,
    fullName: `${owner}/${name}`,
    homepage: stats.homepage,
    isFork: repo.isFork,
    isPrivate: repo.visibility !== 'public',
    language: stats.language,
    name,
    owner,
    ownerAvatar: stats.ownerAvatar,
    provider: forgeIdOf(repo.ref),
    stars: stats.stars,
    topics: repo.topics,
    updatedAt: (repo.pushedAt ?? repo.updatedAt)?.toISOString(),
    url: repo.url ?? ''
  }
}
