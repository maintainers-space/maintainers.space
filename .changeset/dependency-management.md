---
'maintainers.space': minor
---

Adds a dependency-management page under Notifications that aggregates Renovate and Dependabot pull requests from every repository you can push to, groups them by the dependency and target version they update, and lets you approve and merge a whole group at once. Merging is sequential and non-optimistic, and any PRs that fail are reported per-repository after the batch completes.
