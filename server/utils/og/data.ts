// Reads what each OG card shows. Every reader is a Nitro cached function, so the meta tags and the
// image for one page share a single round of forge requests, and a page shared in many places
// costs the forge one request per ten minutes. A failed read returns `undefined` and the caller
// falls back to a plainer card: a social preview must never fail.
import {
  CompositeDidDocumentResolver,
  LocalActorResolver,
  PlcDidDocumentResolver,
  WebDidDocumentResolver,
  XrpcHandleResolver
} from '@atcute/identity-resolver'
import type { ActorIdentifier } from '@atcute/lexicons'
import type { ForgeProvider, Repo, RepoRef, ThreadKind } from 'forges'
import { namespaceRef } from 'forges'
import { bitbucket } from 'forges/bitbucket'
import { forgejo } from 'forges/forgejo'
import { gitea } from 'forges/gitea'
import { github } from 'forges/github'
import { gitlab } from 'forges/gitlab'
import { tangled } from 'forges/tangled'

import { forgeList, getForge, repoRefOf } from '~/lib/forges/registry'
import type {
  OgForge,
  OgLanguage,
  OgOwnerCard,
  OgProfileCard,
  OgRepoCard,
  OgThreadCard,
  OgThreadState
} from './cards'

const CACHE = { maxAge: 600, staleMaxAge: 3600, swr: true } as const
const OWNER_REPO_LIMIT = 100

type Loose = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

// --- Providers ---------------------------------------------------------------------------------

const providers = new Map<string, ForgeProvider>()

/** One server-side provider per forge. GitHub uses `NUXT_OG_GITHUB_TOKEN` when set. */
function providerFor(id: string): ForgeProvider | undefined {
  const cached = providers.get(id)
  if (cached) return cached
  const descriptor = getForge(id)
  if (!descriptor) return undefined
  const common = { baseUrl: descriptor.baseUrl, instance: descriptor.instance, timeout: 6000 }
  const githubToken = useRuntimeConfig().og?.githubToken
  const provider = (() => {
    switch (descriptor.kind) {
      case 'github':
        return github({
          ...common,
          auth: githubToken ? { token: githubToken, type: 'token' } : undefined
        })
      case 'gitlab':
        return gitlab(common)
      case 'forgejo':
        return forgejo(common)
      case 'gitea':
        return gitea(common)
      case 'bitbucket':
        return bitbucket(common)
      case 'tangled':
        return tangled({ timeout: 6000 })
      default:
        return undefined
    }
  })()
  if (provider) providers.set(id, provider)
  return provider
}

export function ogForge(id: string): OgForge {
  const descriptor = getForge(id)
  return { color: descriptor?.color ?? '#71717a', id, label: descriptor?.label ?? id }
}

export function ogForges(): OgForge[] {
  return forgeList.map((f) => ogForge(f.id))
}

// --- Repositories ------------------------------------------------------------------------------

/**
 * The picture a forge shows for a repository: GitLab's project avatar (often a relative path),
 * Tangled's avatar service for the owner's DID, or the owner's avatar everywhere else.
 */
function repoAvatar(id: string, repo: Repo): string | undefined {
  const raw = (repo.raw ?? {}) as Loose
  const web = getForge(id)?.web
  switch (repo.ref.forge) {
    case 'gitlab': {
      const path: string | undefined = raw.avatar_url ?? raw.namespace?.avatar_url
      return path && web ? new URL(path, web).href : repo.owner?.avatarUrl
    }
    case 'tangled':
      return repo.ref.owner.startsWith('did:')
        ? `https://tangled.org/avatar/${encodeURIComponent(repo.ref.owner)}?size=256&format=jpeg`
        : undefined
    default:
      return repo.owner?.avatarUrl
  }
}

async function readRepo(id: string, owner: string, name: string): Promise<Repo | undefined> {
  const provider = providerFor(id)
  const ref = repoRefOf(id, owner, name)
  if (!provider || !ref) return undefined
  return provider.repos.get(ref)
}

/** Byte or percent shares per language, where the forge has an endpoint for them. */
async function readLanguages(provider: ForgeProvider, repo: Repo): Promise<OgLanguage[]> {
  const { owner, name } = repo.ref
  const path = (() => {
    switch (provider.forge) {
      case 'github':
      case 'forgejo':
      case 'gitea':
        return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/languages`
      case 'gitlab':
        return `/projects/${encodeURIComponent(`${owner}/${name}`)}/languages`
      default:
        return undefined
    }
  })()
  if (!path) return []
  const { data } = await provider.request<Record<string, number>>('GET', path)
  return Object.entries(data ?? {})
    .map(([lang, share]) => ({ name: lang, share }))
    .filter((l) => l.share > 0)
    .sort((a, b) => b.share - a.share)
    .slice(0, 6)
}

export const ogRepoCard = defineCachedFunction(
  async (id: string, owner: string, name: string): Promise<OgRepoCard | undefined> => {
    try {
      const provider = providerFor(id)
      const repo = await readRepo(id, owner, name)
      if (!provider || !repo || repo.visibility !== 'public') return undefined
      const languages = await readLanguages(provider, repo).catch(() => [])
      return {
        avatar: repoAvatar(id, repo),
        description: repo.description?.trim() || undefined,
        forge: ogForge(id),
        forks: repo.forks,
        isArchived: repo.isArchived,
        isFork: repo.isFork,
        issues: repo.openIssueCount,
        kind: 'repo',
        language: repo.language,
        languages,
        name: (repo.raw as Loose)?.value?.name ?? repo.ref.name,
        owner: repo.ref.ownerHandle ?? owner,
        pulls: repo.openPullCount,
        stars: repo.stars
      }
    } catch {
      return undefined
    }
  },
  { ...CACHE, getKey: (id, owner, name) => `${id}/${owner}/${name}`, name: 'og-repo' }
)

// --- Issues, pull requests and discussions -----------------------------------------------------

const KIND: Record<OgThreadCard['kind'], ThreadKind> = {
  discussion: 'discussion',
  issue: 'issue',
  pull: 'pull_request'
}

export const ogThreadCard = defineCachedFunction(
  async (
    kind: OgThreadCard['kind'],
    id: string,
    owner: string,
    name: string,
    number: string
  ): Promise<OgThreadCard | undefined> => {
    try {
      const provider = providerFor(id)
      const ref = repoRefOf(id, owner, name)
      // Tangled threads are addressed by record keys the route doesn't carry; they get the repo card.
      if (!provider || !ref || provider.forge === 'tangled') return undefined
      const [thread, repo] = await Promise.all([
        provider.threads.get({
          forge: ref.forge,
          instance: ref.instance,
          kind: KIND[kind],
          number,
          repo: ref as RepoRef
        }),
        readRepo(id, owner, name).catch(() => undefined)
      ])
      if (repo && repo.visibility !== 'public') return undefined
      const state: OgThreadState =
        thread.state === 'merged'
          ? 'merged'
          : thread.state === 'closed'
            ? 'closed'
            : thread.isDraft
              ? 'draft'
              : 'open'
      return {
        additions: thread.stats?.additions,
        author: thread.author?.login,
        authorAvatar: thread.author?.avatarUrl,
        comments: thread.commentCount,
        createdAt: thread.createdAt,
        deletions: thread.stats?.deletions,
        forge: ogForge(id),
        kind,
        labels: thread.labels.map((l) => ({ color: l.colour, name: l.name })),
        number: thread.ref.displayNumber ?? number,
        owner,
        repo: name,
        repoAvatar: repo ? repoAvatar(id, repo) : undefined,
        state,
        title: thread.title
      }
    } catch {
      return undefined
    }
  },
  {
    ...CACHE,
    getKey: (kind, id, owner, name, number) => `${kind}/${id}/${owner}/${name}/${number}`,
    name: 'og-thread'
  }
)

// --- Owners ------------------------------------------------------------------------------------

export const ogOwnerCard = defineCachedFunction(
  async (id: string, owner: string): Promise<OgOwnerCard | undefined> => {
    try {
      const provider = providerFor(id)
      const descriptor = getForge(id)
      if (!provider || !descriptor) return undefined
      const repos: Repo[] = []
      if (provider.forge === 'tangled') {
        for await (const repo of provider.repos.byOwner(namespaceRef(provider, owner))) {
          repos.push(repo)
          if (repos.length >= OWNER_REPO_LIMIT) break
        }
      } else {
        const page = await provider.search
          .repos({ direction: 'desc', owner, perPage: OWNER_REPO_LIMIT, sort: 'stars' })
          .page()
        repos.push(...page.items)
      }
      // The account itself knows its real repository count; search results stop at a page.
      const user = await provider.users.get(owner).catch(() => undefined)
      if (!repos.length && !user) return undefined
      const ownerActor = user ?? repos.find((r) => r.owner)?.owner
      const kind = ownerActor?.typeRaw?.toLowerCase().includes('org') ? 'organisation' : undefined
      const avatar =
        provider.forge === 'tangled' && repos[0]
          ? repoAvatar(id, repos[0])
          : (ownerActor?.avatarUrl ?? (repos[0] ? repoAvatar(id, repos[0]) : undefined))
      return {
        avatar,
        forge: ogForge(id),
        kind: 'owner',
        owner: repos[0]?.ref.ownerHandle ?? owner,
        ownerLabel: `${descriptor.label} ${kind ?? descriptor.ownerLabel.toLowerCase()}`,
        repoCount: user?.publicRepos ?? repos.length,
        repoCountIsLowerBound: user?.publicRepos === undefined && repos.length >= OWNER_REPO_LIMIT,
        topRepos: [...repos]
          .sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0))
          .slice(0, 3)
          .map((r) => ({
            language: r.language,
            name: (r.raw as Loose)?.value?.name ?? r.ref.name,
            stars: r.stars
          }))
      }
    } catch {
      return undefined
    }
  },
  { ...CACHE, getKey: (id, owner) => `${id}/${owner}`, name: 'og-owner' }
)

// --- atproto profiles --------------------------------------------------------------------------

const identityResolver = new LocalActorResolver({
  didDocumentResolver: new CompositeDidDocumentResolver({
    methods: { plc: new PlcDidDocumentResolver(), web: new WebDidDocumentResolver() }
  }),
  handleResolver: new XrpcHandleResolver({ serviceUrl: 'https://public.api.bsky.app' })
})

interface ForgeAccountRecord {
  provider?: string
  username?: string
  verified?: boolean
}

export const ogProfileCard = defineCachedFunction(
  async (handle: string): Promise<OgProfileCard | undefined> => {
    try {
      const identity = await identityResolver.resolve(handle.replace(/^@/, '') as ActorIdentifier)
      const [profile, records] = await Promise.all([
        $fetch<Loose>('https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile', {
          query: { actor: identity.did },
          timeout: 5000
        }).catch(() => ({}) as Loose),
        $fetch<{ records?: Array<{ value: ForgeAccountRecord }> }>(
          `${identity.pds}/xrpc/com.atproto.repo.listRecords`,
          {
            query: { collection: 'space.maintainers.forgeAccount', limit: 20, repo: identity.did },
            timeout: 5000
          }
        ).catch(() => ({ records: [] }))
      ])
      return {
        accounts: (records.records ?? [])
          .map((r) => r.value)
          .filter((v) => v.provider && v.username && getForge(v.provider))
          .map((v) => ({ forge: ogForge(v.provider!), username: v.username! })),
        avatar: profile.avatar,
        description: profile.description?.trim() || undefined,
        displayName: profile.displayName?.trim() || undefined,
        handle: identity.handle !== 'handle.invalid' ? identity.handle : handle,
        kind: 'profile'
      }
    } catch {
      return undefined
    }
  },
  { ...CACHE, getKey: (handle) => handle.toLowerCase(), name: 'og-profile' }
)
