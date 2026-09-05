# maintainers.space

## 0.2.0

> Internal codename: **Caph**

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

- [#5](https://github.com/maintainers-space/maintainers.space/pull/5) [`40c21be`](https://github.com/maintainers-space/maintainers.space/commit/40c21be0a7b1349a4e1cd0274d168f60ce6b9f32) Thanks [@trueberryless-bot](https://github.com/trueberryless-bot)! - Improves release safety, automated quality checks and accessibility across the application
