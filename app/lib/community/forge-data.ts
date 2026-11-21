// What the suggested layout is built from: the owner's repositories and, for an organisation, its
// teams, read through the `forges` package with whatever token the viewer has connected.
import { namespaceRef, type ForgeProvider, type Repo } from 'forges'
import { listOwnerRepos } from '~/lib/forges/reads'
import { toRepoCard } from '~/lib/forges/view'
import type { PlanRepo, PlanTeam } from './structure'

export function toPlanRepo(repo: Repo): PlanRepo {
  const card = toRepoCard(repo)
  return {
    description: card.description,
    isArchived: repo.isArchived,
    isFork: card.isFork,
    isPrivate: card.isPrivate,
    name: card.name,
    stars: card.stars,
    url: card.url.toLowerCase()
  }
}

/**
 * The organisation's teams, or none when the forge has no teams, the owner is a user, or the
 * viewer's token can't see them. Teams are a bonus, so not seeing them never blocks a setup.
 */
async function listTeams(provider: ForgeProvider, owner: string): Promise<PlanTeam[]> {
  if (!provider.can('orgs.teams')) return []
  try {
    const page = await provider.orgs.teams(namespaceRef(provider, owner), { perPage: 100 }).page()
    return page.items.map((team) => ({
      description: team.description,
      name: team.name,
      slug: team.ref.slug,
      url: (team.url ?? `${owner}/${team.ref.slug}`).toLowerCase(),
      visibility: team.visibilityRaw
    }))
  } catch {
    return []
  }
}

export async function loadPlanInput(
  provider: ForgeProvider,
  owner: string
): Promise<{ repos: PlanRepo[]; teams: PlanTeam[] }> {
  const [repos, teams] = await Promise.all([
    listOwnerRepos(provider, owner),
    listTeams(provider, owner)
  ])
  return { repos: repos.map(toPlanRepo), teams }
}
