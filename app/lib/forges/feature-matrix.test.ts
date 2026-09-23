import { describe, expect, it } from 'vitest'
import type { ForgeFeatureMatrix } from '~/types/features'
import { forgeList } from '.'

// Every method of every feature group. `satisfies` keeps this list complete and
// in sync with the interfaces, so a new capability can't be left out of the table.
const matrixRows = {
  repoRead: {
    getOverview: true,
    getRepo: true,
    listRepos: true,
    listAccessibleRepos: true,
    listFollowedRepos: true
  },
  codeRead: { listBranches: true, getTree: true, getBlob: true },
  commitRead: { listCommits: true, getCommit: true },
  issueRead: { listIssues: true, getIssue: true },
  pullRead: {
    listPulls: true,
    getPull: true,
    getPullFiles: true,
    getPullCommits: true,
    listPullReviews: true,
    listPullReviewComments: true,
    getMergeQueue: true
  },
  discussionRead: { listDiscussions: true, getDiscussion: true },
  actionRead: { listActionRuns: true, getActionRun: true, getActionJobLog: true },
  search: {
    searchRepos: true,
    searchIssues: true,
    searchCode: true,
    searchUsers: true,
    searchDiscussions: true
  },
  notificationRead: { listNotifications: true, listInbox: true, markNotificationRead: true },
  write: {
    createComment: true,
    createReview: true,
    createPullReviewReply: true,
    addReaction: true,
    removeReaction: true,
    mergePull: true,
    setStar: true
  },
  activityRead: { listUserEvents: true, listMyWork: true, isStarred: true, listFollowing: true }
} satisfies {
  [G in keyof ForgeFeatureMatrix]-?: Record<keyof NonNullable<ForgeFeatureMatrix[G]>, true>
}

function supports(features: ForgeFeatureMatrix, group: string, method: string): boolean {
  const impl = (features as unknown as Record<string, Record<string, unknown> | undefined>)[group]
  return typeof impl?.[method] === 'function'
}

function renderMatrix(): string {
  const lines = [
    '# Forge Feature Matrix',
    '',
    'Generated from each provider’s `features` by `app/lib/forges/feature-matrix.test.ts`.',
    'Regenerate with `pnpm vitest run -u app/lib/forges/feature-matrix.test.ts`.',
    '',
    `| Feature | ${forgeList.map((p) => p.label).join(' | ')} |`,
    `| --- | ${forgeList.map(() => ':---:').join(' | ')} |`
  ]
  for (const [group, methods] of Object.entries(matrixRows)) {
    for (const method of Object.keys(methods)) {
      const cells = forgeList.map((p) => (supports(p.features, group, method) ? '✅' : '—'))
      lines.push(`| \`${group}.${method}\` | ${cells.join(' | ')} |`)
    }
  }
  return lines.join('\n') + '\n'
}

describe('forge feature matrix', () => {
  it('matches the committed FORGE_MATRIX.md', async () => {
    await expect(renderMatrix()).toMatchFileSnapshot('../../../FORGE_MATRIX.md')
  })
})
