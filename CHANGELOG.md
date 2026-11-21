# maintainers.space

## 0.3.0

### Minor Changes

- [#15](https://github.com/maintainers-space/maintainers.space/pull/15) [`db543dc`](https://github.com/maintainers-space/maintainers.space/commit/db543dc3c7b7f66e77d5924e3ee68db014ed2e60) Thanks [@trueberryless-bot](https://github.com/trueberryless-bot)! - Adds GitHub Markdown Alerts across rendered forge comments and Markdown previews.

- [#20](https://github.com/maintainers-space/maintainers.space/pull/20) [`6d14966`](https://github.com/maintainers-space/maintainers.space/commit/6d14966e63a25598b2614227423b3d401f05d154) Thanks [@trueberryless-bot](https://github.com/trueberryless-bot)! - Adds a dedicated Dependency updates page (at `/dependencies`, with its own sidebar entry) that aggregates Renovate and Dependabot pull requests from every repository you can push to, groups them by the dependency and target version they update, and lets you approve and merge a whole group at once. Merging is sequential and non-optimistic, and any PRs that fail are reported per-repository after the batch completes.

- [#52](https://github.com/maintainers-space/maintainers.space/pull/52) [`4cb1a88`](https://github.com/maintainers-space/maintainers.space/commit/4cb1a88b79469959a953c90ad509f939135220b5) Thanks [@trueberryless-bot](https://github.com/trueberryless-bot)! - Adds social preview images for shared links. Repositories, issues, pull requests, discussions, owners and profiles each get their own card with names, avatars, states, labels, stats and languages on every forge, over a honeycomb that is unique to each page and tinted by its language or state, and every page now has a real title and description for link previews. Set the optional `NUXT_OG_GITHUB_TOKEN` to give the server a higher GitHub rate limit for these.

- [#51](https://github.com/maintainers-space/maintainers.space/pull/51) [`3b5c171`](https://github.com/maintainers-space/maintainers.space/commit/3b5c17188fbdd05e70ed1a4eb65e44b657e9cc57) Thanks [@trueberryless-bot](https://github.com/trueberryless-bot)! - Improves owner pages with a header showing the owner's name, avatar, forge and number of repositories, plus a link to their page on the forge.

- [#30](https://github.com/maintainers-space/maintainers.space/pull/30) [`e1e2276`](https://github.com/maintainers-space/maintainers.space/commit/e1e2276806072a8babf90417370f6721877e9db3) Thanks [@trueberryless](https://github.com/trueberryless)! - Adds a unified activity timeline to pull requests that interleaves comments, reviews, inline review threads and suggested changes, with filters for comments or reviews and oldest- or newest-first sorting.

- [#32](https://github.com/maintainers-space/maintainers.space/pull/32) [`a62ba44`](https://github.com/maintainers-space/maintainers.space/commit/a62ba4473b60ff753c9e3c85979821bff819d3af) Thanks [@trueberryless](https://github.com/trueberryless)! - Adds a details panel to pull request conversations with reviewers, approvals, labels, author, dates, commits and changes. On wide screens it stays beside the description while you read it; on narrow screens an info button opens it as a popover.

- [#31](https://github.com/maintainers-space/maintainers.space/pull/31) [`4527ed5`](https://github.com/maintainers-space/maintainers.space/commit/4527ed5761c7a5eeea0d8a4d54e81aaad556f8f0) Thanks [@trueberryless](https://github.com/trueberryless)! - Adds repository-scoped access tokens: when an organization blocks third-party OAuth apps, you can save a fine-grained token for that repository and comments, reviews and reactions there use it. Forge pages now also hide features a forge doesn't support instead of failing to load.

- [#18](https://github.com/maintainers-space/maintainers.space/pull/18) [`0af83e4`](https://github.com/maintainers-space/maintainers.space/commit/0af83e49dbd9344758ea3f72a08ff736dcfb4f32) Thanks [@trueberryless-bot](https://github.com/trueberryless-bot)! - Adds pull-request reviews and their inline suggestion threads to the conversation view, with replies and automatic lazy loading on scroll. Removes the redundant diff count from the Files changed tab heading.

- [#33](https://github.com/maintainers-space/maintainers.space/pull/33) [`3e20f22`](https://github.com/maintainers-space/maintainers.space/commit/3e20f22eb8bf0c4dc2b305d1be6e6a62c61117c0) Thanks [@trueberryless-bot](https://github.com/trueberryless-bot)! - Replaces the built-in GitHub, GitLab, Codeberg, Gitea, Bitbucket and Tangled clients with the `forges` package. Pull requests, issues, discussions, reviews, reactions, notifications, search and CI now share one data model and one set of typed errors, so rate limits, revoked tokens and organization restrictions report the same way everywhere.

### Patch Changes

- [#34](https://github.com/maintainers-space/maintainers.space/pull/34) [`a581ef1`](https://github.com/maintainers-space/maintainers.space/commit/a581ef17bd285070eeb3798ead0917b1998d453d) Thanks [@trueberryless-bot](https://github.com/trueberryless-bot)! - Fixes keyboard and screen reader navigation: adds a "Skip to content" link and a main landmark, names the repository menu and refresh buttons, and lets code blocks be scrolled with the keyboard.

- [#50](https://github.com/maintainers-space/maintainers.space/pull/50) [`3240d9c`](https://github.com/maintainers-space/maintainers.space/commit/3240d9c29698e016e425199af84b0e61c9d1c442) Thanks [@trueberryless-bot](https://github.com/trueberryless-bot)! - Fixes the active repository tab being out of view on phones when opening a later tab such as Actions directly.

- [#55](https://github.com/maintainers-space/maintainers.space/pull/55) [`2c141e7`](https://github.com/maintainers-space/maintainers.space/commit/2c141e7b73010a47121718a18595b195d31a54ce) Thanks [@trueberryless-bot](https://github.com/trueberryless-bot)! - Fixes pages such as Discussions failing with "can't access property owner" after an update, when the offline cache still held data saved by an older version.

- [#36](https://github.com/maintainers-space/maintainers.space/pull/36) [`bf0a007`](https://github.com/maintainers-space/maintainers.space/commit/bf0a0077ad2f3818b2a069dd4f89c1c2003650f8) Thanks [@trueberryless-bot](https://github.com/trueberryless-bot)! - Fixes CI triggers showing as raw names such as `Workflow_run`, and the job log link naming the forge by its id.

- [#49](https://github.com/maintainers-space/maintainers.space/pull/49) [`2a32f13`](https://github.com/maintainers-space/maintainers.space/commit/2a32f136814fe78a75243172481db11894a84a3f) Thanks [@trueberryless-bot](https://github.com/trueberryless-bot)! - Improves the repository header on phones: topics now only show on the repository overview, and phones show the first four with a "+N more" button, so issues, pull requests and CI runs start higher on the screen.

- [#45](https://github.com/maintainers-space/maintainers.space/pull/45) [`20af74e`](https://github.com/maintainers-space/maintainers.space/commit/20af74e92419e2fc1f6f37c8acf89cd7ff5670f0) Thanks [@trueberryless-bot](https://github.com/trueberryless-bot)! - Fixes low-contrast text in light mode: repository topics and other tinted badges, and inactive tabs, now meet WCAG AA.

- [#22](https://github.com/maintainers-space/maintainers.space/pull/22) [`27db313`](https://github.com/maintainers-space/maintainers.space/commit/27db3130ec79f17cfdf25783e5709494b457d8f3) Thanks [@trueberryless-bot](https://github.com/trueberryless-bot)! - Refreshes the sign-in screen with the official logo, swaps the tangled.org PDS suggestion for eurosky.social, and replaces the GitHub footer link with links to the newly expanded Terms of Service and Privacy Policy (which now cover cookies, data deletion and how to report security concerns).

- [#37](https://github.com/maintainers-space/maintainers.space/pull/37) [`daab898`](https://github.com/maintainers-space/maintainers.space/commit/daab89843844545c1d66a23e1be1e27d0915779c) Thanks [@trueberryless-bot](https://github.com/trueberryless-bot)! - Fixes inline code showing literal backticks, and lists every supported forge on the home page.

- [#46](https://github.com/maintainers-space/maintainers.space/pull/46) [`3c108cd`](https://github.com/maintainers-space/maintainers.space/commit/3c108cd2676941369fcb308bb4997e2066ab6687) Thanks [@trueberryless-bot](https://github.com/trueberryless-bot)! - Fixes keyboard focus for code blocks written as raw HTML, and Markdown attributes that contained `<pre>` getting cut off.

- [#35](https://github.com/maintainers-space/maintainers.space/pull/35) [`85487ce`](https://github.com/maintainers-space/maintainers.space/commit/85487ce923561c4b14611af500252c12eeec3bb2) Thanks [@trueberryless-bot](https://github.com/trueberryless-bot)! - Fixes repository and pull request tabs being cut off on narrow screens, and long inline code overflowing comments.

- [#21](https://github.com/maintainers-space/maintainers.space/pull/21) [`d58c3b9`](https://github.com/maintainers-space/maintainers.space/commit/d58c3b998f9714d12a70921745ad4fd36307d560) Thanks [@trueberryless-bot](https://github.com/trueberryless-bot)! - Fixes atproto sign-in on non-production hosts (e.g. the main branch deployment at main.maintainers.space) by serving the OAuth client metadata document per request origin instead of from a hardcoded production file. Each hosted branch now presents a client the user's PDS accepts for that host.

- [#41](https://github.com/maintainers-space/maintainers.space/pull/41) [`56e35a8`](https://github.com/maintainers-space/maintainers.space/commit/56e35a883b9f7b8b1342078d339cd6196fd78697) Thanks [@trueberryless-bot](https://github.com/trueberryless-bot)! - Fixes error messages showing raw request URLs that ran off the screen on phones. Errors now say in plain words what went wrong, such as a missing or private repository, an expired connection or a network problem.

- [#44](https://github.com/maintainers-space/maintainers.space/pull/44) [`c8510a9`](https://github.com/maintainers-space/maintainers.space/commit/c8510a9591140765db9f5c7bd5ab72c519921b62) Thanks [@trueberryless-bot](https://github.com/trueberryless-bot)! - Fixes the repository menu dropping below long descriptions, and long repository names being cut off on phones.

- [#53](https://github.com/maintainers-space/maintainers.space/pull/53) [`f67ff4d`](https://github.com/maintainers-space/maintainers.space/commit/f67ff4d9bc076171934b3778a7d1439ebf523fde) Thanks [@trueberryless-bot](https://github.com/trueberryless-bot)! - Fixes signing in always landing on the home page. You now come back to the page that asked you to sign in, such as notifications or the timeline.

- [#42](https://github.com/maintainers-space/maintainers.space/pull/42) [`c2b1ac5`](https://github.com/maintainers-space/maintainers.space/commit/c2b1ac5ade7805b8e1243f9b6a5b4f5b7df67a2a) Thanks [@trueberryless-bot](https://github.com/trueberryless-bot)! - Fixes search results showing in whatever order the forges answered and then jumping into place, and improves ranking for searches with more than one word, such as `vue router`.

- [#47](https://github.com/maintainers-space/maintainers.space/pull/47) [`278d667`](https://github.com/maintainers-space/maintainers.space/commit/278d66708a42371adb2cfd8da9e0de71c0c9e89d) Thanks [@trueberryless-bot](https://github.com/trueberryless-bot)! - Updates search to order results by relevance across every forge, so the best match comes first instead of smaller forges being mixed in above it.

- [#43](https://github.com/maintainers-space/maintainers.space/pull/43) [`a84e9bb`](https://github.com/maintainers-space/maintainers.space/commit/a84e9bb9907f8bf1c5bc0ffd49594156c0d990f6) Thanks [@trueberryless-bot](https://github.com/trueberryless-bot)! - Fixes the notifications, timeline and dependency updates pages asking signed-out visitors to sign in without a way to do it. They now have a "Sign in" button that brings you back to the page afterwards, and no longer show a refresh button that does nothing.

- [#39](https://github.com/maintainers-space/maintainers.space/pull/39) [`94477d5`](https://github.com/maintainers-space/maintainers.space/commit/94477d56286fe50151f42eeb674d51524992665b) Thanks [@trueberryless-bot](https://github.com/trueberryless-bot)! - Fixes signing out leaving your forge connections behind, so the next person to sign in on the same browser could read your notifications and private repositories. Signing out now disconnects every forge on that device; your linked accounts stay on your profile, and you reconnect them after signing back in.

- [#48](https://github.com/maintainers-space/maintainers.space/pull/48) [`736760f`](https://github.com/maintainers-space/maintainers.space/commit/736760f8d27d9e4ff4b6dbe71d5ee8d07423b7b3) Thanks [@trueberryless-bot](https://github.com/trueberryless-bot)! - Fixes pages announcing two or three top-level headings to screen readers. Each page now has one, the title in the top bar, with the repository, issue, pull request and profile titles below it.

- [#54](https://github.com/maintainers-space/maintainers.space/pull/54) [`511b979`](https://github.com/maintainers-space/maintainers.space/commit/511b979c81311683c5d73daea97642acc8ac4c14) Thanks [@trueberryless-bot](https://github.com/trueberryless-bot)! - Fixes `NUXT_PUBLIC_SITE_URL` being ignored, so social preview images and verified account badges on deploy previews use the configured site again.

- [#40](https://github.com/maintainers-space/maintainers.space/pull/40) [`f127406`](https://github.com/maintainers-space/maintainers.space/commit/f127406b8d3c008c703c27031b41ed1b481328e4) Thanks [@trueberryless-bot](https://github.com/trueberryless-bot)! - Fixes Tangled repositories and profiles failing with "Repository not found". Tangled's index no longer answers repository lookups, so they are now read from the owner's own records.

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
