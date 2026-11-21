---
name: nuxt-testing
description: Design and maintain Vitest, Playwright, axe-core, and Lighthouse tests for this Nuxt application. Use for test-driven development, regressions, accessibility audits, performance checks, and CI failures.
---

# Nuxt testing

Choose the lowest test layer that proves the behavior:

- Vitest for parsers, mappers, ranking, validation, composables and server utilities.
- Playwright for routing, forms, responsive behavior and interactions across component boundaries.
- axe-core within Playwright for automatically detectable WCAG A/AA failures.
- Lighthouse for production-build accessibility, best-practice, SEO and performance budgets.

Write the failing regression first when fixing a bug. Assert outcomes through roles, labels and visible behavior rather than CSS structure or implementation details. Mock third-party forges at the network boundary; never depend on mutable production data for correctness.

Run focused tests while iterating, then:

```bash
pnpm run test:coverage
pnpm run test:e2e
```

For performance-sensitive or document metadata changes, build first and run `pnpm run test:lighthouse`. Never lower a threshold without recording a concrete, reviewed reason.

To verify everything at once, regardless of test layer, use `pnpm run check:all` — it runs lint, format, type check, coverage, knip, dependency audit, E2E, a fresh build and Lighthouse back-to-back. Prefer it when you need full-confidence verification (e.g. before a PR or in response to a CI failure), and craft a narrower command when you only need one layer. `check:all` is serial and slow; give it a generous timeout (30–60 minutes) and don't run it alongside other checks.
