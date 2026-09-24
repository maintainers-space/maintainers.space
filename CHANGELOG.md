# maintainers.space

## 0.3.0

### Minor Changes

- [#15](https://github.com/maintainers-space/maintainers.space/pull/15) [`db543dc`](https://github.com/maintainers-space/maintainers.space/commit/db543dc3c7b7f66e77d5924e3ee68db014ed2e60) Thanks [@trueberryless-bot](https://github.com/trueberryless-bot)! - Adds GitHub Markdown Alerts across rendered forge comments and Markdown previews.

- [#20](https://github.com/maintainers-space/maintainers.space/pull/20) [`6d14966`](https://github.com/maintainers-space/maintainers.space/commit/6d14966e63a25598b2614227423b3d401f05d154) Thanks [@trueberryless-bot](https://github.com/trueberryless-bot)! - Adds a dedicated Dependency updates page (at `/dependencies`, with its own sidebar entry) that aggregates Renovate and Dependabot pull requests from every repository you can push to, groups them by the dependency and target version they update, and lets you approve and merge a whole group at once. Merging is sequential and non-optimistic, and any PRs that fail are reported per-repository after the batch completes.

- [#30](https://github.com/maintainers-space/maintainers.space/pull/30) [`e1e2276`](https://github.com/maintainers-space/maintainers.space/commit/e1e2276806072a8babf90417370f6721877e9db3) Thanks [@trueberryless](https://github.com/trueberryless)! - Adds a unified activity timeline to pull requests that interleaves comments, reviews, inline review threads and suggested changes, with filters for comments or reviews and oldest- or newest-first sorting.

- [#32](https://github.com/maintainers-space/maintainers.space/pull/32) [`a62ba44`](https://github.com/maintainers-space/maintainers.space/commit/a62ba4473b60ff753c9e3c85979821bff819d3af) Thanks [@trueberryless](https://github.com/trueberryless)! - Adds a details panel to pull request conversations with reviewers, approvals, labels, author, dates, commits and changes. On wide screens it stays beside the description while you read it; on narrow screens an info button opens it as a popover.

- [#31](https://github.com/maintainers-space/maintainers.space/pull/31) [`4527ed5`](https://github.com/maintainers-space/maintainers.space/commit/4527ed5761c7a5eeea0d8a4d54e81aaad556f8f0) Thanks [@trueberryless](https://github.com/trueberryless)! - Adds repository-scoped access tokens: when an organization blocks third-party OAuth apps, you can save a fine-grained token for that repository and comments, reviews and reactions there use it. Forge pages now also hide features a forge doesn't support instead of failing to load.

- [#18](https://github.com/maintainers-space/maintainers.space/pull/18) [`0af83e4`](https://github.com/maintainers-space/maintainers.space/commit/0af83e49dbd9344758ea3f72a08ff736dcfb4f32) Thanks [@trueberryless-bot](https://github.com/trueberryless-bot)! - Adds pull-request reviews and their inline suggestion threads to the conversation view, with replies and automatic lazy loading on scroll. Removes the redundant diff count from the Files changed tab heading.

### Patch Changes

- [#22](https://github.com/maintainers-space/maintainers.space/pull/22) [`27db313`](https://github.com/maintainers-space/maintainers.space/commit/27db3130ec79f17cfdf25783e5709494b457d8f3) Thanks [@trueberryless-bot](https://github.com/trueberryless-bot)! - Refreshes the sign-in screen with the official logo, swaps the tangled.org PDS suggestion for eurosky.social, and replaces the GitHub footer link with links to the newly expanded Terms of Service and Privacy Policy (which now cover cookies, data deletion and how to report security concerns).

- [#21](https://github.com/maintainers-space/maintainers.space/pull/21) [`d58c3b9`](https://github.com/maintainers-space/maintainers.space/commit/d58c3b998f9714d12a70921745ad4fd36307d560) Thanks [@trueberryless-bot](https://github.com/trueberryless-bot)! - Fixes atproto sign-in on non-production hosts (e.g. the main branch deployment at main.maintainers.space) by serving the OAuth client metadata document per request origin instead of from a hardcoded production file. Each hosted branch now presents a client the user's PDS accepts for that host.

## 0.2.1

### Patch Changes

- [#14](https://github.com/maintainers-space/maintainers.space/pull/14) [`e755f12`](https://github.com/maintainers-space/maintainers.space/commit/e755f12386b1687dc07d0e98db73ad7ccfd6a5f7) Thanks [@trueberryless-bot](https://github.com/trueberryless-bot)! - Remove the Explore page and its social graph.

- [#11](https://github.com/maintainers-space/maintainers.space/pull/11) [`7bd7410`](https://github.com/maintainers-space/maintainers.space/commit/7bd7410d6558092493012e4e0ccb5be515ce3cee) Thanks [@trueberryless-bot](https://github.com/trueberryless-bot)! - Show all GitHub issue and pull request comments, including threads with more than 100 comments.

- [#13](https://github.com/maintainers-space/maintainers.space/pull/13) [`4d60b88`](https://github.com/maintainers-space/maintainers.space/commit/4d60b88fe419c9c4b1c44b0fad4ccfd49b8f9539) Thanks [@trueberryless-bot](https://github.com/trueberryless-bot)! - Automatically save the browsable surface of recently opened public repositories and clearly mark unavailable offline content.

## 0.2.0

### Minor Changes

- [#9](https://github.com/maintainers-space/maintainers.space/pull/9) [`8aaa81c`](https://github.com/maintainers-space/maintainers.space/commit/8aaa81ccd65b7edd20006966d467e969417efdd2) Thanks [@trueberryless-bot](https://github.com/trueberryless-bot)! - Add offline availability across the app. Frequently-visited repositories are automatically
  cached locally (bounded by a configurable maximum, default 100) along with the issues, pull
  requests and discussions you've opened or participated in, and each repo's open issue/PR/
  discussion lists (public repositories only — private repos are never stored offline).
  Any repo can be pinned to stay available offline (never auto-cleaned),
  and retention is storage-bounded rather than age-based so infrequently-visited repos stay
  available longer. The landing page now streams recent contributions as each forge responds
  instead of waiting for all of them, and the repo header collapses its actions into a compact
  "…" menu.

### Patch Changes

- [#10](https://github.com/maintainers-space/maintainers.space/pull/10) [`9537ed4`](https://github.com/maintainers-space/maintainers.space/commit/9537ed4f0befc66c96c14d544925a2d740c5c829) Thanks [@trueberryless-bot](https://github.com/trueberryless-bot)! - Improves release automation: Changesets now creates the version tag and GitHub release, and the workflow fast-forwards the release branch after each version merge.

- [#5](https://github.com/maintainers-space/maintainers.space/pull/5) [`40c21be`](https://github.com/maintainers-space/maintainers.space/commit/40c21be0a7b1349a4e1cd0274d168f60ce6b9f32) Thanks [@trueberryless-bot](https://github.com/trueberryless-bot)! - Improves release safety, automated quality checks and accessibility across the application

## 0.1.0

Initial public release of **maintainers.space** — a unified dashboard for interacting with repositories across every major forge in one place.

### Multi-forge access

- Connect your account to **GitHub, GitLab, Codeberg (Forgejo), Bitbucket, Gitea and Tangled** via OAuth
- One unified profile, timeline, notifications and feed, mixed and aggregated across all connected providers
- Personal access token UI with app-wide token injection for forges that support it

### Authentication & accounts

- AT Protocol (atproto) based authentication with long-lived OAuth and device-local reconnect
- Unforgeable server-signed attestations verifying that you control each linked account
- Granular per-forge OAuth scopes instead of full account access
- Unified profile that lists every linked account and cross-links to the provider

### Timeline & home feed

- Me / Friends activity timeline, grouped by day, with deep links to the exact event and actor avatars
- Home feed with a jump-back-in section and a contributions feed
- Cross-forge feeds balanced by a configurable per-forge dominance factor
- Persistent event-type filter badges so you can focus on what matters

### Notifications

- Actionable, importance-ranked inbox with dependency triage
- Mark-as-read, resolved groups and collapsible grouped CI failures
- A "spot-the-bug" game for reaching inbox zero

### Search

- Unified cross-provider search with a GitHub-style query language
- Cross-provider discussion search and relevance ranking
- Animated filter suggestions, aggregated warning banners and per-forge caching

### Repositories

- Tabbed repo detail pages: code, issues, pull requests, actions and discussions
- Code file browser with a branch switcher and back-to-repo link
- Star and unstar repositories across all providers
- PR review with a GFM markdown editor, diff totals and inline suggestions
- Merge-queue and merge-train statistics
- Reactions on GitHub, GitLab and Gitea, with emoji autocomplete and nested discussion replies
- Expandable action-run step logs with step timing and activity logs
- Diff stat and Files-changed tab, plus inline badge rendering

### Repo metadata & ownership

- `dev.koinon.repoMetadata` lexicon with server-side ownership verification
- Owner management UI with claim OAuth and community links display

### Polish & reliability

- PWA support with offline usage and client SWR caching
- Accent color picker, custom logo/favicon and dismissable banner hints
- Reusable command palette, user and repo context menus
- Accessibility, unit and end-to-end quality gates
