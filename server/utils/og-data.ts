// Public, best-effort data fetching for the OG-image bot responder. Reuses the
// same provider-agnostic forge layer and atproto helpers the app itself uses
// (proven safe to import from `server/` — plain TS, no browser globals, no Vue
// composables) rather than duplicating five forges' worth of API-shape
// knowledge. Every function swallows its own errors and returns `null` on
// failure so the caller can fall back to the generic Page template.
import { getForge } from '~/lib/forges'
import { fetchPublicProfile, listPublicRecords, type PublicProfile } from '~/lib/atproto/public'
import type {
  ForgeDiscussionDetail,
  ForgeIssueDetail,
  ForgePullDetail,
  ForgeRepo
} from '~/types/forge'

// Mirrors `FORGE_ACCOUNT_COLLECTION` in `app/composables/useForgeAccounts.ts`.
// Duplicated rather than imported: that composable carries Vue-reactive
// module-level state with no business loading into a Nitro server context.
const FORGE_ACCOUNT_COLLECTION = 'space.maintainers.forgeAccount'

export interface OgForgeAccount {
  provider: string
  username: string
}

export interface OgRepoData {
  repo: ForgeRepo
  languages?: Record<string, number>
}

/** Repo metadata + language breakdown for the repo OG image's language ring. */
export async function ogFetchRepo(
  provider: string,
  owner: string,
  name: string
): Promise<OgRepoData | null> {
  const forge = getForge(provider)
  if (!forge?.getRepo) return null
  try {
    const repo = await forge.getRepo(owner, name)
    const languages = await forge.getLanguages?.(owner, name).catch(() => undefined)
    return { repo, languages }
  } catch {
    return null
  }
}

/** An owner's repositories, for the Owner OG image. */
export async function ogFetchOwnerRepos(
  provider: string,
  owner: string
): Promise<ForgeRepo[] | null> {
  const forge = getForge(provider)
  if (!forge?.listRepos) return null
  try {
    return await forge.listRepos(owner)
  } catch {
    return null
  }
}

export interface OgProfileData {
  profile: PublicProfile
  accounts: OgForgeAccount[]
}

/** Public atproto profile + linked forge accounts, for the Profile OG image. */
export async function ogFetchProfile(handle: string): Promise<OgProfileData | null> {
  try {
    const profile = await fetchPublicProfile(handle)
    const records = await listPublicRecords<OgForgeAccount>(handle, FORGE_ACCOUNT_COLLECTION)
    const accounts = records
      .map((r) => r.value)
      .filter((a): a is OgForgeAccount => !!a?.provider && !!a?.username)
    return { profile, accounts }
  } catch {
    return null
  }
}

/** An issue's detail, for the Issue OG image. */
export async function ogFetchIssue(
  provider: string,
  owner: string,
  name: string,
  id: string
): Promise<ForgeIssueDetail | null> {
  const forge = getForge(provider)
  if (!forge?.getIssue) return null
  try {
    return await forge.getIssue({ owner, name }, id)
  } catch {
    return null
  }
}

/** A pull/merge request's detail, for the PR OG image. */
export async function ogFetchPull(
  provider: string,
  owner: string,
  name: string,
  id: string
): Promise<ForgePullDetail | null> {
  const forge = getForge(provider)
  if (!forge?.getPull) return null
  try {
    return await forge.getPull({ owner, name }, id)
  } catch {
    return null
  }
}

/**
 * A discussion's detail, for the Discussion OG image. GitHub's Discussions API
 * requires an auth token even for anonymous reads, so this returns `null`
 * there — the caller falls back to the generic Page template in that case.
 */
export async function ogFetchDiscussion(
  provider: string,
  owner: string,
  name: string,
  id: string
): Promise<ForgeDiscussionDetail | null> {
  const forge = getForge(provider)
  if (!forge?.getDiscussion) return null
  try {
    return await forge.getDiscussion({ owner, name }, id)
  } catch {
    return null
  }
}
