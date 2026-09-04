# Accessibility review

Use this skill for every user-facing component, page or style change. Target WCAG 2.2 AA while recognizing that automated scans do not replace keyboard and screen-reader reasoning.

1. Prefer native semantic HTML. Add ARIA only when native semantics cannot express the behavior, and never use ARIA to repair the wrong element.
2. Check heading order, landmarks, accessible names, form labels and errors, link purpose, status announcements and image alternatives.
3. Verify the complete keyboard path: visible focus, logical order, activation, dismissal, focus restoration and no keyboard traps.
4. Check contrast in light and dark modes, zoom/reflow, mobile targets and reduced motion. Do not communicate state by color alone.
5. For overlays and dynamic updates, verify initial focus, focus containment where required, Escape behavior and an appropriate live region.
6. Add outcome-based Playwright coverage and an axe-core scan. Manually reason about semantics and interaction patterns axe cannot detect.
7. Run `pnpm run test:e2e`; run Lighthouse for page, layout or rendering changes.
