# maintainers.space

[![Nuxt UI](https://img.shields.io/badge/Made%20with-Nuxt%20UI-00DC82?logo=nuxt&labelColor=020420)](https://ui.nuxt.com)

maintainers.space pulls your work across Git hosts into one place. Repos, issues, pull requests and notifications from GitHub, GitLab, Codeberg, Gitea, Bitbucket and [Tangled](https://tangled.org), all in one dashboard. You sign in with your AT Protocol (Bluesky) identity, and maintainers.space uses that same identity to find your accounts on each of them. Built with [Nuxt](https://nuxt.com) and [Nuxt UI](https://ui.nuxt.com).

There's no maintainers.space password. Signing in happens through atproto, so nothing is shared with a third party. From there you link accounts through a real OAuth flow (never a personal access token), and maintainers.space starts pulling in that provider's notifications, plus the repos and people you follow there, right alongside everything from the other forges you've linked, mixed together and ranked rather than shown provider-by-provider. atproto records are public and anyone can edit their own, so a plain "verified" flag would prove nothing on its own; maintainers.space signs a small server-side attestation for each linked account so the badge on a public profile actually reflects that the OAuth check happened. Sign in and you also get a personal home feed: pull requests worth jumping back into, review requests, assigned issues, your recent and favourite repos. Every user gets a shareable `/profile/<handle>` page listing their linked accounts, repos and activity, signed in or not.

Not every forge does everything — Bitbucket has no issue tracker (Atlassian is retiring it), for example — so a repo's tabs and a user's feed only ever show what that forge actually supports, rather than faking parity that doesn't exist.

## Contributing

Bug reports, feature requests and pull requests are all welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for local setup, the OAuth apps you'll need to register, and the project's conventions.

## Quality checks

Every pull request and merge-queue group runs the same required quality gate:

- Oxlint, Oxfmt, TypeScript, Knip and a production Nuxt build.
- Vitest unit tests with V8 coverage thresholds measured broadly across app and server logic. The baseline stays explicit in `vitest.config.ts` so untested forge clients are not hidden by a selective badge.
- Playwright checks across desktop and mobile Chromium, including anonymous browsing, repository navigation, sign-in helpers, legal pages and axe-core WCAG A/AA scans.
- Lighthouse CI on the indexable home, privacy and terms pages, with minimum scores of 0.75 performance and 0.90 accessibility, best practices and SEO.
- CodeQL extended security queries, dependency review and zizmor's pedantic GitHub Actions audit.

Run the principal checks locally with:

```bash
pnpm run test:coverage
pnpm exec playwright install chromium
pnpm run test:e2e
pnpm run build
pnpm run test:lighthouse
```

Playwright traces, screenshots and videos are retained only on failure. CI uploads the Playwright and Lighthouse HTML reports for 14 days.

The pre-commit hook uses the dependency-free `nano-staged` runner to format and lint only staged files. The pre-push hook runs the complete local quality gate, including browser tests. CodeRabbit CLI review is available as an optional final review with `pnpm run review:ai`; it requires separate CodeRabbit authentication and is not a mandatory hook because it sends the diff to an external service.

## License

Made with ❤️

Published under [MIT License](https://github.com/maintainers-space/maintainers.space/blob/main/LICENSE).
