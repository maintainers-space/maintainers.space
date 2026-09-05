---
'maintainers.space': minor
---

Add offline availability across the app. Frequently-visited repositories are automatically
cached locally (bounded by a configurable maximum, default 100) along with the issues, pull
requests and discussions you've opened or participated in, and each repo's open issue/PR/
discussion lists (public repositories only — private repos are never stored offline).
Any repo can be pinned to stay available offline (never auto-cleaned),
and retention is storage-bounded rather than age-based so infrequently-visited repos stay
available longer. The landing page now streams recent contributions as each forge responds
instead of waiting for all of them, and the repo header collapses its actions into a compact
"…" menu.
