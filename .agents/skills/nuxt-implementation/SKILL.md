---
name: nuxt-implementation
description: Implement features and bug fixes in this Nuxt 4 application. Use when changing Vue pages or components, composables, forge integrations, server routes, authentication, storage, or navigation.
---

# Nuxt implementation

1. Trace the user-facing behavior from route or component through composables and forge/server adapters.
2. Identify trust boundaries, loading states, empty states, errors, offline behavior and mobile behavior before editing.
3. Reuse types from `app/types/forge.ts`, registered forge capabilities from `app/lib/forges`, Nuxt UI components and established composable state patterns.
4. Keep credentials and authenticated forge requests in their existing boundary. Do not move browser-only tokens into server logs, shared caches or rendered output.
5. Write the smallest coherent implementation. Comments should explain constraints or non-obvious reasons, not narrate the code.
6. Add Vitest coverage for isolated logic and Playwright coverage for behavior visible to a user.
7. Run `pnpm run check:quick` while iterating, then activate the `change-review` skill.
