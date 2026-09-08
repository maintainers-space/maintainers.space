# maintainers.space

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

### Explore & the social graph

- Cross-forge social graph rendered with force-graph, with person cards and trending
- Public follow/followers/contributors across providers, fair friend interleaving
- Cached, long-TTL proxy for social-graph reads

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
