# koinon

[![Nuxt UI](https://img.shields.io/badge/Made%20with-Nuxt%20UI-00DC82?logo=nuxt&labelColor=020420)](https://ui.nuxt.com)

koinon pulls your work across Git hosts into one place. Repos, issues, pull requests and notifications from GitHub, GitLab, Codeberg and [Tangled](https://tangled.org), all in one dashboard. You sign in with your AT Protocol (Bluesky) identity, and koinon uses that same identity to find your accounts on each of them. Built with [Nuxt](https://nuxt.com) and [Nuxt UI](https://ui.nuxt.com).

There's no koinon password. Signing in happens through atproto, so nothing is shared with a third party. From there you link a GitHub, GitLab or Codeberg account through a real OAuth flow (never a personal access token), and koinon starts pulling in that provider's notifications, plus the repos and people you follow there, right alongside everything from the other forges you've linked. atproto records are public and anyone can edit their own, so a plain "verified" flag would prove nothing on its own; koinon signs a small server-side attestation for each linked account so the badge on a public profile actually reflects that the OAuth check happened. Sign in and you also get a personal home feed: pull requests worth jumping back into, review requests, assigned issues, your recent and favourite repos. Every user gets a shareable `/profile/<handle>` page listing their linked accounts, repos and activity, signed in or not.

## Contributing

Bug reports, feature requests and pull requests are all welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for local setup, the OAuth apps you'll need to register, and the project's conventions.

## License

Made with ❤️

Published under [MIT License](https://github.com/trueberryless/koinon/blob/main/LICENSE).
