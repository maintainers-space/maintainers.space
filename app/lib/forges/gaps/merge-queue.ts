// GAP(forges): merge queues (GitHub) and merge trains (GitLab) are not modelled.
import type { ForgeProvider, Repo } from 'forges'

export interface MergeQueueEntry {
  author?: string
  number?: string
  position: number
  status?: string
  title: string
}

export interface MergeQueue {
  branch: string
  entries: MergeQueueEntry[]
  kind: 'queue' | 'train'
}

export async function getMergeQueue(
  provider: ForgeProvider,
  repo: Repo
): Promise<MergeQueue | null> {
  const branch = repo.defaultBranch
  if (provider.forge === 'github') return githubQueue(provider, repo, branch)
  if (provider.forge === 'gitlab') return gitlabTrain(provider, repo, branch)
  return null
}

async function githubQueue(
  provider: ForgeProvider,
  repo: Repo,
  branch?: string
): Promise<MergeQueue | null> {
  const query = `query($owner:String!,$name:String!,$branch:String){
    repository(owner:$owner,name:$name){ mergeQueue(branch:$branch){ entries(first:50){ nodes{ state pullRequest{ number title author{ login } } } } } }
  }`
  const res = await provider.request<{
    data?: {
      repository?: {
        mergeQueue?: {
          entries?: {
            nodes?: Array<{
              state?: string
              pullRequest?: { number?: number; title?: string; author?: { login?: string } }
            } | null>
          }
        } | null
      }
    }
  }>('POST', '/graphql', {
    body: {
      query,
      variables: { branch: branch ?? null, name: repo.ref.name, owner: repo.ref.owner }
    },
    mutates: false
  })
  const nodes = (res.data.data?.repository?.mergeQueue?.entries?.nodes ?? []).filter((n) => !!n)
  if (!nodes.length) return null
  return {
    branch: branch ?? '',
    entries: nodes.map((n, i) => ({
      author: n.pullRequest?.author?.login,
      number: n.pullRequest?.number === undefined ? undefined : String(n.pullRequest.number),
      position: i + 1,
      status: n.state,
      title: n.pullRequest?.title ?? ''
    })),
    kind: 'queue'
  }
}

async function gitlabTrain(
  provider: ForgeProvider,
  repo: Repo,
  branch?: string
): Promise<MergeQueue | null> {
  const id = encodeURIComponent(`${repo.ref.owner}/${repo.ref.name}`)
  const path = branch
    ? `/projects/${id}/merge_trains/${encodeURIComponent(branch)}`
    : `/projects/${id}/merge_trains`
  const res = await provider.request<
    Array<{
      status?: string
      target_branch?: string
      merge_request?: { iid?: number; title?: string; author?: { username?: string } }
    }>
  >('GET', path, { query: { per_page: 50, scope: 'active' } })
  const cars = (res.data ?? []).filter((c) => !branch || c.target_branch === branch)
  if (!cars.length) return null
  return {
    branch: branch ?? cars[0]?.target_branch ?? '',
    entries: cars.map((c, i) => ({
      author: c.merge_request?.author?.username,
      number: c.merge_request?.iid === undefined ? undefined : String(c.merge_request.iid),
      position: i + 1,
      status: c.status,
      title: c.merge_request?.title ?? ''
    })),
    kind: 'train'
  }
}
