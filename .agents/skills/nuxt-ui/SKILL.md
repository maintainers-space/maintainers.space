# Nuxt UI

Use this skill whenever changing Nuxt UI components, forms, overlays, theming or layout. The upstream reference is `https://ui.nuxt.com/.well-known/skills/nuxt-ui/SKILL.md`; consult current component metadata there instead of guessing props or slots.

1. Reuse Nuxt UI components and established project patterns before creating a parallel primitive.
2. Use semantic colors such as `text-default`, `text-muted`, `bg-elevated` and `border-muted`; raw palette colors are reserved for deliberate brand or data-visualization requirements.
3. Read generated theme files under `.nuxt/ui/` before overriding slots. Prefer a local `ui` or `class` override, then global `app.config.ts` configuration, over broad CSS selectors.
4. Use Standard Schema validation with `UForm` and `UFormField`. Keep validation at the form boundary rather than duplicating it in click handlers.
5. Preserve loading, empty, error, disabled, keyboard, focus, dark-mode, responsive and reduced-motion behavior.
6. Use Iconify’s `i-{collection}-{name}` convention and the installed collections.
7. Verify user-facing behavior with Playwright and load the `accessibility-review` skill.
