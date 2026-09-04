---
name: change-review
description: Perform the pre-commit and pre-pull-request review of a code change. Use after implementation, before pushing, and when responding to CI or reviewer findings.
---

# Change review

Review the diff as a skeptical maintainer:

1. Confirm every changed line belongs to the requested behavior and public APIs remain coherent.
2. Look for authorization mistakes, exposed secrets, unsafe proxy destinations, injection, cache leaks, stale state, race conditions and missing error handling.
3. Check keyboard use, accessible names, contrast, focus behavior, empty/loading/error states and desktop/mobile layouts.
4. Confirm tests would fail without the implementation and cover important negative paths.
5. Inspect dependency and workflow changes especially closely. Keep permissions minimal and Actions SHA-pinned. Explain write permissions and non-obvious read permissions; `contents: read` needs no comment.
6. Remove redundant comments, unreachable guards, duplicate validation, generated files, debug output and formatting noise. Comments should preserve a constraint, workaround or non-obvious decision rather than narrate the code.
7. Run `pnpm run check:push`. Run `zizmor --persona pedantic .` for workflow changes and `pnpm run test:lighthouse` for user-facing or performance-sensitive changes.

If CodeRabbit CLI is already installed and authenticated, the repository owner has approved external review, and the diff contains no secrets, run:

```bash
pnpm run review:ai
```

Resolve actionable findings and rerun affected checks before creating the pull request. Do not repeatedly amend published commits merely to make history look artificially clean; prefer a small number of coherent commits from the outset.
