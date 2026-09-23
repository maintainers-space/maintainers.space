// Renders the OG image for any app route as a PNG. Route params here are
// unreliable for a catch-all with a fixed `.png` suffix (Nitro folds the
// suffix into the param's key rather than stripping it), so the target path
// is derived directly from the request URL instead.
import { CACHE_MEDIUM, setCacheHeaders } from '../../utils/cache'
import {
  ogFetchDiscussion,
  ogFetchIssue,
  ogFetchOwnerRepos,
  ogFetchProfile,
  ogFetchPull,
  ogFetchRepo
} from '../../utils/og-data'
import { renderOgImage } from '../../utils/og-render'
import { ogIssueTemplate, type OgIssueLikeData } from '../../utils/og-template-issue'
import { ogOwnerTemplate } from '../../utils/og-template-owner'
import { ogPageTemplate } from '../../utils/og-template-page'
import { ogProfileTemplate } from '../../utils/og-template-profile'
import { ogRepoTemplate } from '../../utils/og-template-repo'
import { resolveOgTarget } from '../../utils/og-target'
import type { Node } from '@takumi-rs/core'

async function resolveIssueLike(
  target: Extract<ReturnType<typeof resolveOgTarget>, { kind: 'issue' | 'pull' | 'discussion' }>
): Promise<OgIssueLikeData | null> {
  const { provider, owner, repo, id, kind } = target
  if (kind === 'issue') {
    const issue = await ogFetchIssue(provider, owner, repo, id)
    if (!issue) return null
    return {
      kind,
      provider,
      owner,
      repo,
      number: issue.number,
      title: issue.title,
      author: issue.author,
      commentCount: issue.commentCount,
      state: issue.state
    }
  }
  if (kind === 'pull') {
    const pull = await ogFetchPull(provider, owner, repo, id)
    if (!pull) return null
    return {
      kind,
      provider,
      owner,
      repo,
      number: pull.number,
      title: pull.title,
      author: pull.author,
      commentCount: pull.commentCount,
      state: pull.state
    }
  }
  const discussion = await ogFetchDiscussion(provider, owner, repo, id)
  if (!discussion) return null
  return {
    kind,
    provider,
    owner,
    repo,
    number: discussion.number,
    title: discussion.title,
    author: discussion.author,
    commentCount: discussion.commentCount,
    state: discussion.answered ? 'answered' : 'unanswered'
  }
}

async function resolveNode(
  target: ReturnType<typeof resolveOgTarget>,
  path: string
): Promise<Node> {
  if (target.kind === 'repo') {
    const data = await ogFetchRepo(target.provider, target.owner, target.repo)
    if (data) return ogRepoTemplate(data)
  } else if (target.kind === 'owner') {
    const repos = await ogFetchOwnerRepos(target.provider, target.owner)
    if (repos) return ogOwnerTemplate({ provider: target.provider, owner: target.owner, repos })
  } else if (target.kind === 'profile') {
    const data = await ogFetchProfile(target.handle)
    if (data) return ogProfileTemplate(data)
  } else if (target.kind === 'issue' || target.kind === 'pull' || target.kind === 'discussion') {
    const data = await resolveIssueLike(target)
    if (data) return ogIssueTemplate(data)
  }
  // Every other target kind — and a fetch that came back empty — renders the
  // generic branded card.
  return ogPageTemplate(target.kind === 'page' ? target.path : path)
}

export default defineEventHandler(async (event) => {
  const pathname = getRequestURL(event).pathname
  const path = pathname.replace(/^\/_og\//, '').replace(/\.png$/, '')
  const target = resolveOgTarget(path)

  const node = await resolveNode(target, path)
  const png = await renderOgImage(node)

  setResponseHeader(event, 'Content-Type', 'image/png')
  setCacheHeaders(event, CACHE_MEDIUM)
  return png
})
