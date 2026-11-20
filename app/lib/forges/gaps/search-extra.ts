// GAP(forges): `search` covers repos, threads and commits. People, code and discussion search are
// not modelled, so they are read through `provider.request()` and shaped for the search page.
import type { ForgeProvider } from 'forges'

import { forgeIdOf } from '../registry'

export interface UserHit {
  avatarUrl?: string
  login: string
  name?: string
  provider: string
}

export interface CodeHit {
  fragments: string[]
  path: string
  provider: string
  repo: { fullName: string; name: string; owner: string }
}

export interface DiscussionHit {
  author?: string
  category?: string
  commentCount?: number
  createdAt?: string
  isAnswered: boolean
  number: number
  provider: string
  repo: { fullName: string; name: string; owner: string }
  title: string
}

export function canSearchUsers(provider: ForgeProvider): boolean {
  return ['github', 'gitlab', 'forgejo', 'gitea'].includes(provider.forge)
}

export function canSearchCode(provider: ForgeProvider): boolean {
  return provider.forge === 'github' && provider.can('threads.createComment', 'issue')
}

export function canSearchDiscussions(provider: ForgeProvider): boolean {
  return provider.forge === 'github' && provider.can('threads.list', 'discussion')
}

type Loose = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

export async function searchUsers(
  provider: ForgeProvider,
  text: string,
  perPage = 20
): Promise<UserHit[]> {
  const id = forgeIdOf(provider)
  const mapUser = (u: Loose): UserHit => ({
    avatarUrl: u.avatar_url,
    login: u.login ?? u.username,
    name: u.full_name ?? u.name,
    provider: id
  })
  switch (provider.forge) {
    case 'github': {
      const res = await provider.request<{ items: Loose[] }>('GET', '/search/users', {
        query: { per_page: perPage, q: text }
      })
      return res.data.items.map(mapUser)
    }
    case 'gitlab': {
      const res = await provider.request<Loose[]>('GET', '/users', {
        query: { per_page: perPage, search: text }
      })
      return res.data.map(mapUser)
    }
    default: {
      const res = await provider.request<{ data: Loose[] }>('GET', '/users/search', {
        query: { limit: perPage, q: text }
      })
      return res.data.data.map(mapUser)
    }
  }
}

export async function searchCode(
  provider: ForgeProvider,
  text: string,
  perPage = 20
): Promise<CodeHit[]> {
  const res = await provider.request<{ items: Loose[] }>('GET', '/search/code', {
    headers: { accept: 'application/vnd.github.text-match+json' },
    query: { per_page: perPage, q: text }
  })
  return res.data.items.map((item) => ({
    fragments: (item.text_matches ?? [])
      .map((m: Loose) => String(m.fragment ?? ''))
      .filter(Boolean),
    path: item.path,
    provider: forgeIdOf(provider),
    repo: {
      fullName: item.repository.full_name,
      name: item.repository.name,
      owner: item.repository.owner.login
    }
  }))
}

export async function searchDiscussions(
  provider: ForgeProvider,
  text: string,
  perPage = 20
): Promise<DiscussionHit[]> {
  const query = `query($q:String!,$n:Int!){ search(query:$q,type:DISCUSSION,first:$n){ nodes{ ... on Discussion{
    number title createdAt answerChosenAt comments{ totalCount } category{ name } author{ login }
    repository{ name nameWithOwner owner{ login } } } } } }`
  const res = await provider.request<{ data?: { search?: { nodes?: Loose[] } } }>(
    'POST',
    '/graphql',
    {
      body: { query, variables: { n: perPage, q: text } },
      mutates: false
    }
  )
  return (res.data.data?.search?.nodes ?? [])
    .filter((n) => n?.number)
    .map((n) => ({
      author: n.author?.login,
      category: n.category?.name,
      commentCount: n.comments?.totalCount,
      createdAt: n.createdAt,
      isAnswered: !!n.answerChosenAt,
      number: n.number,
      provider: forgeIdOf(provider),
      repo: {
        fullName: n.repository.nameWithOwner,
        name: n.repository.name,
        owner: n.repository.owner.login
      },
      title: n.title
    }))
}
