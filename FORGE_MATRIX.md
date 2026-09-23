# Forge Feature Matrix

Generated from each provider’s `features` by `app/lib/forges/feature-matrix.test.ts`.
Regenerate with `pnpm vitest run -u app/lib/forges/feature-matrix.test.ts`.

| Feature | GitHub | GitLab | Tangled | Codeberg | Gitea | Bitbucket |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| `repoRead.getOverview` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `repoRead.getRepo` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `repoRead.listRepos` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `repoRead.listAccessibleRepos` | ✅ | ✅ | — | ✅ | ✅ | — |
| `repoRead.listFollowedRepos` | ✅ | ✅ | — | ✅ | ✅ | — |
| `codeRead.listBranches` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `codeRead.getTree` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `codeRead.getBlob` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `commitRead.listCommits` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `commitRead.getCommit` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `issueRead.listIssues` | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| `issueRead.getIssue` | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| `pullRead.listPulls` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `pullRead.getPull` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `pullRead.getPullFiles` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `pullRead.getPullCommits` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `pullRead.listPullReviews` | ✅ | — | — | — | — | — |
| `pullRead.listPullReviewThreads` | ✅ | — | — | — | — | — |
| `pullRead.getMergeQueue` | ✅ | ✅ | — | — | — | — |
| `discussionRead.listDiscussions` | ✅ | — | — | — | — | — |
| `discussionRead.getDiscussion` | ✅ | — | — | — | — | — |
| `actionRead.listActionRuns` | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| `actionRead.getActionRun` | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| `actionRead.getActionJobLog` | ✅ | ✅ | — | ✅ | ✅ | — |
| `search.searchRepos` | ✅ | ✅ | — | ✅ | ✅ | — |
| `search.searchIssues` | ✅ | ✅ | — | ✅ | ✅ | — |
| `search.searchCode` | ✅ | ✅ | — | — | — | — |
| `search.searchUsers` | ✅ | ✅ | — | ✅ | ✅ | — |
| `search.searchDiscussions` | ✅ | — | — | — | — | — |
| `notificationRead.listNotifications` | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| `notificationRead.listInbox` | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| `notificationRead.markNotificationRead` | ✅ | ✅ | — | ✅ | ✅ | — |
| `write.createComment` | ✅ | ✅ | — | ✅ | ✅ | ✅ |
| `write.createReview` | ✅ | ✅ | — | ✅ | ✅ | ✅ |
| `write.createPullReviewReply` | ✅ | — | — | — | — | — |
| `write.addReaction` | ✅ | ✅ | — | ✅ | ✅ | — |
| `write.removeReaction` | ✅ | ✅ | — | ✅ | ✅ | — |
| `write.mergePull` | ✅ | ✅ | — | ✅ | ✅ | ✅ |
| `write.setStar` | ✅ | ✅ | — | ✅ | ✅ | — |
| `activityRead.listUserEvents` | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| `activityRead.listMyWork` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `activityRead.isStarred` | ✅ | ✅ | — | ✅ | ✅ | — |
| `activityRead.listFollowing` | ✅ | ✅ | — | ✅ | ✅ | — |
