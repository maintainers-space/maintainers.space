import { forgeList, getForge } from '~/lib/forges'
import type { ForgeId, ForgeRepo, ForgeUser } from '~/types/forge'

// Builds the Explore page's cross-forge social graph: the viewer at the
// center, their friends (atproto follows + each linked forge's own following
// list) one hop out, a bounded "friends of friends" layer beyond that, and a
// handful of project nodes connecting people to what they contribute to.
//
// Node identity: anyone reachable through the atproto follow graph has a
// known DID, so every one of their linked forge accounts (public
// `space.maintainers.forgeAccount` records, same mechanism as the profile page) is
// resolved and merged into one node. People reached only through a
// forge-native graph (a following list, a repo's contributors) have no known
// DID and get one node per `provider:login` — unless that exact login
// happens to match an account already resolved for a DID elsewhere in this
// same graph build, in which case it merges in for free.

const MAX_DEPTH1 = 40
const MAX_DEPTH2_EXPAND_PEOPLE = 10
const MAX_DEPTH2_PER_PERSON = 15
const MAX_DEPTH2_TOTAL = 60
const MAX_PROJECT_SOURCES = 8
const MAX_PROJECTS_PER_PERSON = 3
const MAX_CONTRIBUTORS_PER_PROJECT = 8

export interface GraphAccountRef {
  provider: ForgeId
  login: string
  url?: string | null
}

export interface GraphPersonNode {
  kind: 'person'
  id: string
  depth: 0 | 1 | 2
  label: string
  avatarUrl?: string | null
  profileUrl: string
  accounts: GraphAccountRef[]
  did?: string
}

export interface GraphProjectNode {
  kind: 'project'
  id: string
  label: string
  provider: ForgeId
  owner: string
  name: string
  fullName: string
  url?: string | null
}

export type GraphNode = GraphPersonNode | GraphProjectNode

export interface GraphLink {
  source: string
  target: string
  kind: 'follows' | 'contributes'
}

interface ForgeAccountValue {
  provider?: string
  username?: string
  displayName?: string
  avatarUrl?: string
  profileUrl?: string
}

interface GraphFollow {
  did: string
  handle: string
  displayName?: string
  avatar?: string
}

export function useSocialGraph() {
  const { did, profile } = useAuth()
  const { get: getToken } = useForgeTokens()
  const { accounts, loaded: accountsLoaded, refresh: refreshAccounts } = useForgeAccounts()

  const nodes = ref<GraphNode[]>([])
  const links = ref<GraphLink[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function load(): Promise<void> {
    const viewerDid = did.value
    if (!viewerDid) {
      nodes.value = []
      links.value = []
      return
    }

    loading.value = true
    error.value = null

    const nodesById = new Map<string, GraphNode>()
    // "provider:login" (lowercase) -> did, so a forge-native discovery can
    // merge into an already-resolved multi-provider person for free.
    const identityMap = new Map<string, string>()
    const linkKeys = new Set<string>()
    const linkList: GraphLink[] = []

    function addLink(source: string, target: string, kind: GraphLink['kind']): void {
      if (source === target) return
      const key = `${kind}:${source}<->${target}`
      const revKey = `${kind}:${target}<->${source}`
      if (linkKeys.has(key) || linkKeys.has(revKey)) return
      linkKeys.add(key)
      linkList.push({ source, target, kind })
    }

    /** Resolve (or reuse) a DID-backed person node, merging every linked forge account. */
    async function upsertDidPerson(
      personDid: string,
      depth: 1 | 2,
      hint?: { handle?: string; displayName?: string; avatar?: string }
    ): Promise<GraphPersonNode> {
      const existing = nodesById.get(personDid) as GraphPersonNode | undefined
      if (existing) {
        if (depth < existing.depth) existing.depth = depth
        return existing
      }
      const records = await $fetch<ForgeAccountValue[]>('/api/graph/forge-accounts', {
        query: { did: personDid }
      }).catch(() => [] as ForgeAccountValue[])
      for (const r of records) {
        if (r.provider && r.username)
          identityMap.set(`${r.provider}:${r.username.toLowerCase()}`, personDid)
      }
      const primary = records[0]
      const node: GraphPersonNode = {
        kind: 'person',
        id: personDid,
        depth,
        label:
          hint?.displayName ||
          hint?.handle ||
          primary?.displayName ||
          primary?.username ||
          shortDid(personDid),
        avatarUrl: hint?.avatar || primary?.avatarUrl || null,
        profileUrl: `/profile/${hint?.handle || personDid}`,
        accounts: records
          .filter(
            (
              r
            ): r is Required<Pick<ForgeAccountValue, 'provider' | 'username'>> &
              ForgeAccountValue => !!(r.provider && r.username)
          )
          .map((r) => ({ provider: r.provider as ForgeId, login: r.username, url: r.profileUrl })),
        did: personDid
      }
      nodesById.set(personDid, node)
      return node
    }

    /** Resolve (or reuse) a person node from a single forge-native account, merging into a known DID node when possible. */
    function upsertForgeNativePerson(
      provider: ForgeId,
      user: ForgeUser,
      depth: 1 | 2
    ): GraphPersonNode | null {
      if (!user.login) return null
      const loginKey = `${provider}:${user.login.toLowerCase()}`
      const knownDid = identityMap.get(loginKey)
      if (knownDid) {
        const existing = nodesById.get(knownDid) as GraphPersonNode | undefined
        if (existing) {
          if (
            !existing.accounts.some(
              (a) => a.provider === provider && a.login.toLowerCase() === user.login.toLowerCase()
            )
          ) {
            existing.accounts.push({ provider, login: user.login, url: user.url })
          }
          if (depth < existing.depth) existing.depth = depth
          return existing
        }
      }
      const existing = nodesById.get(loginKey) as GraphPersonNode | undefined
      if (existing) {
        if (depth < existing.depth) existing.depth = depth
        return existing
      }
      const node: GraphPersonNode = {
        kind: 'person',
        id: loginKey,
        depth,
        label: user.displayName || user.login,
        avatarUrl: user.avatarUrl ?? null,
        profileUrl: userPath({ provider, login: user.login }),
        accounts: [{ provider, login: user.login, url: user.url }]
      }
      nodesById.set(loginKey, node)
      return node
    }

    function upsertProject(repo: ForgeRepo): GraphProjectNode {
      const id = `${repo.provider}:${repo.fullName}`
      const existing = nodesById.get(id) as GraphProjectNode | undefined
      if (existing) return existing
      const node: GraphProjectNode = {
        kind: 'project',
        id,
        label: repo.name,
        provider: repo.provider,
        owner: repo.owner,
        name: repo.name,
        fullName: repo.fullName,
        url: repo.url
      }
      nodesById.set(id, node)
      return node
    }

    try {
      // --- Depth 0: the viewer, from live linked accounts (never the long-
      // cached graph endpoint — a freshly-linked account should show up now).
      if (!accountsLoaded.value) await refreshAccounts()
      for (const a of accounts.value)
        identityMap.set(`${a.provider}:${a.username.toLowerCase()}`, viewerDid)
      const viewerNode: GraphPersonNode = {
        kind: 'person',
        id: viewerDid,
        depth: 0,
        label: profile.value?.displayName || profile.value?.handle || shortDid(viewerDid),
        avatarUrl: profile.value?.avatar ?? null,
        profileUrl: `/profile/${profile.value?.handle || viewerDid}`,
        accounts: accounts.value.map((a) => ({
          provider: a.provider as ForgeId,
          login: a.username,
          url: a.profileUrl
        })),
        did: viewerDid
      }
      nodesById.set(viewerDid, viewerNode)

      // --- Depth 1: atproto follows (fully DID-resolved).
      const atFollows = await $fetch<GraphFollow[]>('/api/graph/atproto-follows', {
        query: { did: viewerDid, limit: MAX_DEPTH1 }
      }).catch(() => [] as GraphFollow[])
      const atDepth1 = await Promise.all(
        atFollows.slice(0, MAX_DEPTH1).map(async (f) => {
          const node = await upsertDidPerson(f.did, 1, {
            handle: f.handle,
            displayName: f.displayName,
            avatar: f.avatar
          })
          addLink(viewerDid, node.id, 'follows')
          return node
        })
      )

      // --- Depth 1: each linked forge's own following list (viewer's own token).
      const forgeNativeDepth1: GraphPersonNode[] = []
      for (const forge of forgeList) {
        if (!forge.listFollowing) continue
        const token = getToken(forge.id)
        if (!token) continue
        const list = await forge.listFollowing({ token, limit: 30 }).catch(() => [] as ForgeUser[])
        for (const u of list) {
          const node = upsertForgeNativePerson(forge.id, u, 1)
          if (!node) continue
          addLink(viewerDid, node.id, 'follows')
          forgeNativeDepth1.push(node)
        }
      }

      const depth1People = [...atDepth1, ...forgeNativeDepth1]

      // --- Depth 2: friends of a capped subset of friends.
      let depth2Added = 0
      const expandSubset = depth1People.slice(0, MAX_DEPTH2_EXPAND_PEOPLE)
      await Promise.all(
        expandSubset.map(async (p) => {
          if (depth2Added >= MAX_DEPTH2_TOTAL) return
          if (p.did) {
            const follows = await $fetch<GraphFollow[]>('/api/graph/atproto-follows', {
              query: { did: p.did, limit: MAX_DEPTH2_PER_PERSON }
            }).catch(() => [] as GraphFollow[])
            for (const f of follows) {
              if (depth2Added >= MAX_DEPTH2_TOTAL) break
              const node = await upsertDidPerson(f.did, 2, {
                handle: f.handle,
                displayName: f.displayName,
                avatar: f.avatar
              })
              addLink(p.id, node.id, 'follows')
              if (node.depth === 2) depth2Added++
            }
            return
          }
          const acct = p.accounts[0]
          if (!acct) return
          const forge = getForge(acct.provider)
          if (!forge?.listUserFollowing) return
          const following = await forge
            .listUserFollowing(acct.login, {
              limit: MAX_DEPTH2_PER_PERSON,
              token: getToken(acct.provider)
            })
            .catch(() => [] as ForgeUser[])
          for (const u of following) {
            if (depth2Added >= MAX_DEPTH2_TOTAL) break
            const node = upsertForgeNativePerson(acct.provider, u, 2)
            if (!node) continue
            addLink(p.id, node.id, 'follows')
            if (node.depth === 2) depth2Added++
          }
        })
      )

      // --- Project nodes: the viewer + a subset of depth-1 people's own
      // repos, each connected to a few of its contributors.
      const projectSources: GraphPersonNode[] = [
        viewerNode,
        ...depth1People.slice(0, MAX_PROJECT_SOURCES)
      ]
      await Promise.all(
        projectSources.map(async (person) => {
          const acct = person.accounts[0]
          if (!acct) return
          const forge = getForge(acct.provider)
          if (!forge?.listRepos) return
          const repos = await forge
            .listRepos(acct.login, { token: getToken(acct.provider) })
            .catch(() => [] as ForgeRepo[])
          for (const repo of repos.slice(0, MAX_PROJECTS_PER_PERSON)) {
            const projectNode = upsertProject(repo)
            addLink(person.id, projectNode.id, 'contributes')
            if (!forge.listContributors) continue
            const contributors = await forge
              .listContributors(repo, {
                limit: MAX_CONTRIBUTORS_PER_PROJECT,
                token: getToken(acct.provider)
              })
              .catch(() => [] as ForgeUser[])
            for (const c of contributors) {
              const node = upsertForgeNativePerson(repo.provider, c, 2)
              if (node) addLink(projectNode.id, node.id, 'contributes')
            }
          }
        })
      )

      nodes.value = [...nodesById.values()]
      links.value = linkList
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Could not build the graph.'
    } finally {
      loading.value = false
    }
  }

  return { nodes, links, loading, error, load }
}
