---
'maintainers.space': patch
---

Fixes atproto sign-in on non-production hosts (e.g. the main branch deployment at main.maintainers.space) by serving the OAuth client metadata document per request origin instead of from a hardcoded production file. Each hosted branch now presents a client the user's PDS accepts for that host.
