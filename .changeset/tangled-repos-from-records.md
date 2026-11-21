---
'maintainers.space': patch
---

Fixes Tangled repositories and profiles failing with "Repository not found". Tangled's index no longer answers repository lookups, so they are now read from the owner's own records.
