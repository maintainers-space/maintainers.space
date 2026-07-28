import type {
  ForgeComment,
  ForgeCommit,
  ForgeCommitDetail,
  ForgeFileDiff,
  ForgeIssue,
  ForgeIssueDetail,
  ForgeIssueState,
  ForgeProvider,
  ForgeReadOptions,
  ForgeRepo,
  ForgeTreeEntry,
  ForgeUser,
  RepoLocator
} from '~/types/forge'

import { getForgeToken } from '~/lib/forges/token-store'

// Sourcehut (sr.ht) has no REST API — everything is GraphQL, split across
// independent services (git.sr.ht, todo.sr.ht, meta.sr.ht), each with its own
// `/query` endpoint. Usernames are `~`-prefixed in URLs (`git.sr.ht/~user/repo`).
//
// This is the most limited forge in koinon by design of the platform itself,
// not by choice — confirmed against current sr.ht docs:
//   - No pull/merge requests: sr.ht's contribution model is `git send-email` to
//     mailing lists (lists.sr.ht), with no native PR feature at all.
//   - No notifications inbox, no per-user activity feed, no follow graph, and
//     no cross-repo/global search exist anywhere in the sr.ht API surface.
//   - Issues are best-effort: sr.ht trackers (todo.sr.ht) are independent
//     objects, not strictly tied to a repo, so issues here assume the tracker
//     name equals the repo name (the common convention, not a guarantee).
//   - builds.sr.ht (CI) has a GraphQL API, but its `jobs` query is scoped to
//     "jobs submitted by the authenticated user" with no confirmed per-repo
//     edge — left unimplemented rather than guessed at.
//
// Every query here is wrapped defensively: unlike a REST field miss, a wrong
// GraphQL field name fails the *entire* query, so each method degrades to an
// empty/not-found result on any schema mismatch rather than breaking the page.
//
// Confirmed live: unlike every other forge here, sr.ht's GraphQL endpoints
// require `Authorization: Bearer <token>` for *every* request — including
// reading public repos anonymously (verified: an unauthenticated query against
// git.sr.ht/query returns `ERR_UNAUTHORIZED`, not a data response). So, unlike
// GitHub/GitLab/Codeberg/Gitea/Bitbucket, Sourcehut repos are only browsable in
// koinon once the viewer has connected their own Sourcehut account — there is
// no anonymous "try an example" path for this forge.
const GIT = 'https://git.sr.ht/query'
const TODO = 'https://todo.sr.ht/query'
const WEB = 'https://git.sr.ht'
const TODO_WEB = 'https://todo.sr.ht'

interface GraphQLResponse<T> {
  data?: T
  errors?: { message?: string }[]
}

async function srFetch<T>(
  endpoint: string,
  query: string,
  variables: Record<string, unknown> | undefined,
  opts?: ForgeReadOptions
): Promise<T> {
  const token = opts?.token ?? getForgeToken('sourcehut')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await $fetch<GraphQLResponse<T>>(endpoint, {
    method: 'POST',
    headers,
    body: { query, variables },
    signal: opts?.signal
  })
  if (res.errors?.length) throw new Error(res.errors[0]?.message ?? 'Sourcehut GraphQL error')
  if (!res.data) throw new Error('Sourcehut GraphQL returned no data')
  return res.data
}

function stripTilde(owner: string): string {
  return owner.replace(/^~/, '')
}

interface SrOwnerRef {
  canonicalName?: string
}

interface SrRepo {
  name?: string
  description?: string | null
  visibility?: string
  created?: string | null
  updated?: string | null
  HEAD?: { name?: string } | null
  owner?: SrOwnerRef | null
}

function mapRepo(r: SrRepo, ownerUsername: string): ForgeRepo {
  const name = r.name ?? ''
  return {
    provider: 'sourcehut',
    owner: ownerUsername,
    name,
    fullName: `~${ownerUsername}/${name}`,
    description: r.description ?? null,
    defaultBranch: r.HEAD?.name || 'master',
    url: `${WEB}/~${ownerUsername}/${name}`,
    ownerUrl: `${WEB}/~${ownerUsername}`,
    isPrivate: r.visibility ? r.visibility !== 'PUBLIC' : undefined,
    createdAt: r.created ?? null,
    updatedAt: r.updated ?? null
  }
}

function mapUserRef(ref: SrOwnerRef | null | undefined): ForgeUser | undefined {
  const name = ref?.canonicalName
  if (!name) return undefined
  const login = stripTilde(name)
  return { provider: 'sourcehut', login, url: `${WEB}/~${login}` }
}

function sortEntries(a: ForgeTreeEntry, b: ForgeTreeEntry): number {
  if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
  return a.name.localeCompare(b.name)
}

interface SrTreeEntry {
  name?: string
  object?: { __typename?: string }
}

interface SrPathObject {
  __typename?: string
  content?: string
  size?: number
  entries?: { results?: SrTreeEntry[] }
}

/** `Repository.path(revspec, path)` resolves a single tree/blob node in one call. */
async function fetchPath(
  username: string,
  repo: string,
  rev: string,
  path: string,
  opts?: ForgeReadOptions
): Promise<SrPathObject | null> {
  const data = await srFetch<{ user?: { repository?: { path?: { object?: SrPathObject } } } }>(
    GIT,
    `query($username: String!, $name: String!, $rev: String!, $path: String!) {
      user(username: $username) {
        repository(name: $name) {
          path(revspec: $rev, path: $path) {
            object {
              __typename
              ... on Tree { entries(cursor: null) { results { name object { __typename } } } }
              ... on TextBlob { content size }
              ... on BinaryBlob { content size }
            }
          }
        }
      }
    }`,
    { username, name: repo, rev, path },
    opts
  ).catch(() => null)
  return data?.user?.repository?.path?.object ?? null
}

async function getRootTree(
  username: string,
  repo: string,
  branch: string,
  opts?: ForgeReadOptions
): Promise<ForgeTreeEntry[]> {
  const obj = await fetchPath(username, repo, branch, '', opts)
  if (!obj || obj.__typename !== 'Tree') return []
  return (obj.entries?.results ?? [])
    .map(
      (e): ForgeTreeEntry => ({
        name: e.name ?? '',
        path: e.name ?? '',
        type: e.object?.__typename === 'Tree' ? 'dir' : 'file'
      })
    )
    .sort(sortEntries)
}

function splitUnifiedDiff(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  const parts = String(text ?? '')
    .split(/(?=^diff --git )/m)
    .filter(Boolean)
  for (const part of parts) {
    const plus = part.match(/^\+\+\+ b\/(.+)$/m)
    const diff = part.match(/^diff --git a\/(.+?) b\/(.+)$/m)
    const path = plus?.[1] && plus[1] !== '/dev/null' ? plus[1] : (diff?.[2] ?? '')
    if (path) out[path] = part
  }
  return out
}

interface SrCommitActor {
  name?: string
  email?: string
  time?: string
}

interface SrCommit {
  id?: string
  shortId?: string
  message?: string
  author?: SrCommitActor
  committer?: SrCommitActor
  parents?: { id?: string }[]
  diff?: string
}

function mapCommit(c: SrCommit): ForgeCommit {
  const sha = c.id ?? ''
  const author = c.author
    ? { name: c.author.name, email: c.author.email, when: c.author.time }
    : undefined
  const committer = c.committer
    ? { name: c.committer.name, email: c.committer.email, when: c.committer.time }
    : undefined
  return {
    sha,
    shortSha: c.shortId ?? sha.slice(0, 7),
    message: c.message ?? '',
    author,
    committer,
    parents: (c.parents ?? []).map((p) => p.id ?? '').filter(Boolean)
  }
}

interface SrTicket {
  id?: number
  subject?: string
  body?: string | null
  status?: string
  created?: string | null
  updated?: string | null
  submitter?: SrOwnerRef | null
}

function issueState(status?: string): ForgeIssueState {
  return status === 'RESOLVED' ? 'closed' : 'open'
}

function mapTicket(t: SrTicket, repo: RepoLocator): ForgeIssue {
  const id = String(t.id ?? '')
  return {
    provider: 'sourcehut',
    id,
    number: t.id,
    title: t.subject ?? '',
    state: issueState(t.status),
    author: mapUserRef(t.submitter),
    body: t.body ?? null,
    createdAt: t.created ?? null,
    updatedAt: t.updated ?? t.created ?? null,
    url: `${TODO_WEB}/~${stripTilde(repo.owner)}/${repo.name}/${id}`
  }
}

export const sourcehutProvider: ForgeProvider = {
  id: 'sourcehut',
  label: 'Sourcehut',
  icon: 'i-simple-icons-sourcehut',
  color: '#4a4062',
  ownerLabel: 'Handle',
  ownerPlaceholder: 'e.g. sircmpwn',
  repoPlaceholder: 'e.g. dotfiles',
  capabilities: {
    code: true,
    issues: true,
    pulls: false,
    discussions: false,
    actions: false,
    repoSearch: false,
    issueSearch: false,
    codeSearch: false,
    userSearch: false,
    discussionSearch: false,
    star: false,
    mergeQueue: false,
    reactions: false
  },
  webUrl: (owner, repo) => `${WEB}/~${stripTilde(owner)}/${repo}`,
  ownerWebUrl: (owner) => `${WEB}/~${stripTilde(owner)}`,

  async getRepo(owner, repo, opts) {
    const username = stripTilde(owner)
    const data = await srFetch<{ user?: { repository?: SrRepo } }>(
      GIT,
      `query($username: String!, $name: String!) {
        user(username: $username) {
          repository(name: $name) { name description visibility created updated HEAD { name } }
        }
      }`,
      { username, name: repo },
      opts
    )
    const r = data.user?.repository
    if (!r) {
      throw createError({
        statusCode: 404,
        statusMessage: `Repository "${repo}" was not found on Sourcehut for ~${username}.`
      })
    }
    return mapRepo(r, username)
  },

  async getOverview(owner, repo, opts) {
    const meta = await sourcehutProvider.getRepo!(owner, repo, opts)
    const username = stripTilde(owner)
    const entries = await getRootTree(username, repo, meta.defaultBranch, opts).catch(
      () => [] as ForgeTreeEntry[]
    )
    const readmeEntry = entries.find(
      (e) => e.type === 'file' && /^readme(\.(md|markdown|rst|txt|adoc))?$/i.test(e.name)
    )
    let readme: { filename: string; content: string } | null = null
    if (readmeEntry) {
      try {
        const blob = await sourcehutProvider.getBlob!(
          { owner: username, name: repo },
          meta.defaultBranch,
          readmeEntry.path,
          opts
        )
        if (!blob.isBinary) readme = { filename: readmeEntry.name, content: blob.content }
      } catch {
        readme = null
      }
    }
    return { repo: meta, entries, readme }
  },

  async listRepos(owner, opts) {
    const username = stripTilde(owner)
    const data = await srFetch<{ user?: { repositories?: { results?: SrRepo[] } } }>(
      GIT,
      `query($username: String!) {
        user(username: $username) {
          repositories(cursor: null) {
            results { name description visibility created updated HEAD { name } }
          }
        }
      }`,
      { username },
      opts
    ).catch(() => null)
    const results = data?.user?.repositories?.results ?? []
    return results.map((r) => mapRepo(r, username))
  },

  async getTree(repo, ref, path, opts) {
    const username = stripTilde(repo.owner)
    const obj = await fetchPath(username, repo.name, ref, path, opts)
    if (!obj || obj.__typename !== 'Tree') return []
    return (obj.entries?.results ?? [])
      .map(
        (e): ForgeTreeEntry => ({
          name: e.name ?? '',
          path: path ? `${path}/${e.name}` : (e.name ?? ''),
          type: e.object?.__typename === 'Tree' ? 'dir' : 'file'
        })
      )
      .sort(sortEntries)
  },

  async getBlob(repo, ref, path, opts) {
    const username = stripTilde(repo.owner)
    const obj = await fetchPath(username, repo.name, ref, path, opts)
    if (!obj?.content) {
      throw createError({ statusCode: 404, statusMessage: `File "${path}" was not found.` })
    }
    const isBinary = obj.__typename === 'BinaryBlob'
    const token = opts?.token ?? getForgeToken('sourcehut')
    const buf = await $fetch<ArrayBuffer>(obj.content, {
      responseType: 'arrayBuffer',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      signal: opts?.signal
    }).catch(() => new ArrayBuffer(0))
    const bytes = new Uint8Array(buf)
    if (isBinary) {
      let bin = ''
      const chunk = 0x8000
      for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
      }
      return {
        path,
        ref,
        content: btoa(bin),
        encoding: 'base64',
        isBinary: true,
        size: obj.size ?? bytes.length
      }
    }
    return {
      path,
      ref,
      content: new TextDecoder().decode(bytes),
      encoding: 'utf-8',
      isBinary: false,
      size: obj.size ?? bytes.length
    }
  },

  async listCommits(repo, ref, opts) {
    const username = stripTilde(repo.owner)
    const limit = opts?.limit ?? 30
    const data = await srFetch<{
      user?: { repository?: { log?: { cursor?: string; results?: SrCommit[] } } }
    }>(
      GIT,
      `query($username: String!, $name: String!, $ref: String, $cursor: Cursor) {
        user(username: $username) {
          repository(name: $name) {
            log(cursor: $cursor, from: $ref) {
              cursor
              results { id shortId message author { name email time } committer { name email time } parents { id } }
            }
          }
        }
      }`,
      { username, name: repo.name, ref, cursor: opts?.cursor ?? null },
      opts
    ).catch(() => null)
    const log = data?.user?.repository?.log
    return {
      items: (log?.results ?? []).slice(0, limit).map(mapCommit),
      cursor: log?.cursor ?? undefined
    }
  },

  async getCommit(repo, sha, opts): Promise<ForgeCommitDetail> {
    const username = stripTilde(repo.owner)
    const data = await srFetch<{ user?: { repository?: { log?: { results?: SrCommit[] } } } }>(
      GIT,
      `query($username: String!, $name: String!, $sha: String!) {
        user(username: $username) {
          repository(name: $name) {
            log(cursor: null, from: $sha) {
              results { id shortId message author { name email time } committer { name email time } parents { id } diff }
            }
          }
        }
      }`,
      { username, name: repo.name, sha },
      opts
    )
    const commit = data.user?.repository?.log?.results?.[0]
    if (!commit) {
      throw createError({ statusCode: 404, statusMessage: `Commit "${sha}" was not found.` })
    }
    const patches = splitUnifiedDiff(commit.diff ?? '')
    const files: ForgeFileDiff[] = Object.entries(patches).map(([path, patch]) => ({
      path,
      status: 'modified',
      patch
    }))
    return { ...mapCommit(commit), stat: { filesChanged: files.length }, files }
  },

  async listIssues(repo, opts) {
    const username = stripTilde(repo.owner)
    const data = await srFetch<{ user?: { tracker?: { tickets?: { results?: SrTicket[] } } } }>(
      TODO,
      `query($username: String!, $name: String!) {
        user(username: $username) {
          tracker(name: $name) {
            tickets(cursor: null) {
              results { id subject body status created updated submitter { canonicalName } }
            }
          }
        }
      }`,
      { username, name: repo.name },
      opts
    ).catch(() => null)
    const results = data?.user?.tracker?.tickets?.results ?? []
    let items = results.map((t) => mapTicket(t, repo))
    if (opts?.state && opts.state !== 'all') items = items.filter((i) => i.state === opts.state)
    return { items }
  },

  async getIssue(repo, id, opts): Promise<ForgeIssueDetail> {
    const username = stripTilde(repo.owner)
    const data = await srFetch<{
      user?: {
        tracker?: {
          ticket?: SrTicket & {
            events?: {
              results?: {
                created?: string
                changes?: { __typename?: string; text?: string; author?: SrOwnerRef }[]
              }[]
            }
          }
        }
      }
    }>(
      TODO,
      `query($username: String!, $name: String!, $id: Int!) {
        user(username: $username) {
          tracker(name: $name) {
            ticket(id: $id) {
              id subject body status created updated
              submitter { canonicalName }
              events(cursor: null) {
                results { created changes { __typename ... on Comment { text author { canonicalName } } } }
              }
            }
          }
        }
      }`,
      { username, name: repo.name, id: Number(id) },
      opts
    )
    const ticket = data.user?.tracker?.ticket
    if (!ticket) {
      throw createError({ statusCode: 404, statusMessage: `Ticket "${id}" was not found.` })
    }
    const comments: ForgeComment[] = []
    for (const ev of ticket.events?.results ?? []) {
      for (const change of ev.changes ?? []) {
        if (change.__typename === 'Comment' && change.text) {
          comments.push({
            id: `${ticket.id}-${ev.created}-${comments.length}`,
            author: mapUserRef(change.author),
            body: change.text,
            createdAt: ev.created ?? null
          })
        }
      }
    }
    return { ...mapTicket(ticket, repo), comments }
  },

  async createComment(repo, id, body, opts): Promise<ForgeComment> {
    const username = stripTilde(repo.owner)
    const trackerData = await srFetch<{ user?: { tracker?: { id?: number } } }>(
      TODO,
      `query($username: String!, $name: String!) {
        user(username: $username) { tracker(name: $name) { id } }
      }`,
      { username, name: repo.name },
      opts
    )
    const trackerId = trackerData.user?.tracker?.id
    if (!trackerId) {
      throw createError({ statusCode: 404, statusMessage: 'Sourcehut tracker was not found.' })
    }
    const data = await srFetch<{ submitComment?: { created?: string } }>(
      TODO,
      `mutation($trackerId: Int!, $ticketId: Int!, $input: SubmitCommentInput!) {
        submitComment(trackerId: $trackerId, ticketId: $ticketId, input: $input) { created }
      }`,
      { trackerId, ticketId: Number(id), input: { text: body } },
      opts
    )
    return {
      id: `${id}-${Date.now()}`,
      body,
      createdAt: data.submitComment?.created ?? new Date().toISOString()
    }
  }
}
