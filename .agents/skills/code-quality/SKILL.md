# Code quality

Use this skill while implementing and before review.

- Make types and validated boundaries the source of truth. Do not repeat the same check in every caller.
- Add a runtime guard only for genuinely untrusted or nullable input, and test its failure behavior.
- Prefer straight-line code and early returns over speculative fallback paths.
- Delete unreachable code instead of preserving it “just in case”; type-aware Oxlint and Knip enforce this mechanically.
- Write comments only for constraints, security boundaries, upstream limitations, workarounds or decisions that are not evident from the code. Link an upstream issue when a workaround depends on one.
- Do not narrate assignments, repeat type information or leave stale TODOs.
- Use Conventional Commits: `type(scope): lowercase imperative subject`. Keep commits few, coherent and independently reviewable.
