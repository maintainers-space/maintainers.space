# Contributing to maintainers.space

Thanks for your interest in contributing! This document covers getting a local environment running, the OAuth apps you'll need for the forges you want to work on, and the conventions the codebase follows.

## Table of contents

- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
  - [GitHub](#github)
  - [GitLab](#gitlab)
  - [Codeberg](#codeberg)
  - [Gitea](#gitea)
  - [Bitbucket](#bitbucket)
  - [Sourcehut](#sourcehut)
  - [Attestation signing key](#attestation-signing-key)
- [Project structure](#project-structure)
- [Code style](#code-style)
- [Pre-commit hooks](#pre-commit-hooks)
- [Submitting changes](#submitting-changes)
- [Using AI](#using-ai)
- [Questions](#questions)

## Getting started

You'll need [Node.js](https://nodejs.org/) and [pnpm](https://pnpm.io/) (the version pinned in `packageManager` in `package.json`). Fork and clone the repository, then install dependencies:

```bash
pnpm install
```

Start the dev server:

```bash
pnpm dev
```

maintainers.space binds its dev server to `127.0.0.1` rather than `localhost`. The AT Protocol OAuth flow used for sign-in rejects `localhost` redirect URIs outright, so open `http://127.0.0.1:3000`, not `http://localhost:3000`.

Signing in with atproto needs no configuration in development: it uses a loopback OAuth client scoped to `127.0.0.1`. Linking a GitHub, GitLab, Codeberg, Gitea, Bitbucket or Sourcehut account is opt-in per provider. The app runs fine with none of them configured, it just disables linking for whichever provider you haven't set up. If you're working on something that touches one of those forges, set up that provider's OAuth app using the instructions below and export its client ID and secret before running `pnpm dev`:

```bash
NUXT_GITHUB_CLIENT_ID=... NUXT_GITHUB_CLIENT_SECRET=... pnpm dev
```

## Environment variables

Every provider follows the same shape: create an OAuth application on that forge, point its callback at maintainers.space's own callback route, and set the resulting client ID and secret as environment variables (or in a local `.env` file, see `.env.example`). In development the origin is `http://127.0.0.1:3000`. In production it's wherever you deploy.

### GitHub

Create an OAuth App at [github.com/settings/developers](https://github.com/settings/developers) → "New OAuth App", with the authorization callback URL set to:

```
http://127.0.0.1:3000/api/auth/github/callback
```

GitHub OAuth Apps don't ask you to pick scopes up front. maintainers.space requests `read:user read:org notifications public_repo` at authorization time, which covers reading your repos, orgs, issues, pull requests and notifications. Set the resulting credentials:

```bash
NUXT_GITHUB_CLIENT_ID=your_client_id
NUXT_GITHUB_CLIENT_SECRET=your_client_secret
```

### GitLab

Create an Application at [gitlab.com/-/user_settings/applications](https://gitlab.com/-/user_settings/applications), with the redirect URI set to:

```
http://127.0.0.1:3000/api/auth/gitlab/callback
```

Unlike GitHub, GitLab requires you to select scopes when creating the application. Check `api`, since maintainers.space aims for full parity with the GitHub integration: reading repos, issues and merge requests, the Todos inbox, and approving, merging or commenting on merge requests all need it. Set:

```bash
NUXT_GITLAB_CLIENT_ID=your_application_id
NUXT_GITLAB_CLIENT_SECRET=your_application_secret
```

### Codeberg

Codeberg runs [Forgejo](https://forgejo.org/). Create an application at [codeberg.org/user/settings/applications](https://codeberg.org/user/settings/applications), with the redirect URI set to:

```
http://127.0.0.1:3000/api/auth/codeberg/callback
```

Forgejo's OAuth2 tokens are unscoped. There's no scope picker, a Forgejo application simply gets full access to the account that authorizes it. Set:

```bash
NUXT_CODEBERG_CLIENT_ID=your_client_id
NUXT_CODEBERG_CLIENT_SECRET=your_client_secret
```

### Gitea

[gitea.com](https://gitea.com) is Gitea's own hosted community instance (same Gitea-flavored REST API as Codeberg, just a different host — `app/lib/forges/gitea-family.ts` implements both). Create an application at [gitea.com/user/settings/applications](https://gitea.com/user/settings/applications), with the redirect URI set to:

```
http://127.0.0.1:3000/api/auth/gitea/callback
```

Set:

```bash
NUXT_GITEA_CLIENT_ID=your_client_id
NUXT_GITEA_CLIENT_SECRET=your_client_secret
```

### Bitbucket

Create an OAuth consumer under a workspace's **Settings → OAuth consumers** (`https://bitbucket.org/<workspace>/workspace/settings/oauth-consumers`), with the callback URL set to:

```
http://127.0.0.1:3000/api/auth/bitbucket/callback
```

Unlike the other forges, Bitbucket's token exchange authenticates with HTTP Basic auth rather than a client id/secret in the request body — already handled generically by `tokenAuthStyle: 'basic'` in `server/utils/oauth-providers.ts`. Bitbucket's issue tracker isn't integrated (Atlassian is removing it), and there's no notifications, activity-feed, or follow-graph API to integrate at all — see the comment at the top of `app/lib/forges/bitbucket.ts` for the full list of verified platform limits. Set:

```bash
NUXT_BITBUCKET_CLIENT_ID=your_key
NUXT_BITBUCKET_CLIENT_SECRET=your_secret
```

### Sourcehut

Register an OAuth client at [meta.sr.ht/oauth2](https://meta.sr.ht/oauth2), with the redirect URI set to:

```
http://127.0.0.1:3000/api/auth/sourcehut/callback
```

Two things make Sourcehut's flow different from every other forge here: its redirect URI is fixed at registration time and must not be sent on the authorize request (`omitRedirectUriInAuthorize: true`), and its `/query` GraphQL endpoints (there's no REST API) require an authenticated token for _every_ request — including reading public repos, which is why Sourcehut has no anonymous "try an example" entry on the home page. Sourcehut also has no pull requests (contributions happen via `git send-email`), so `app/lib/forges/sourcehut.ts` only covers code browsing and issues (assuming the tracker name matches the repo name — sr.ht trackers aren't strictly tied to a repo). Set:

```bash
NUXT_SOURCEHUT_CLIENT_ID=your_client_id
NUXT_SOURCEHUT_CLIENT_SECRET=your_client_secret
```

### Attestation signing key

This one isn't a forge OAuth app. It's a private key maintainers.space's own server uses to sign proof that a linked forge account really was verified through OAuth, rather than just claimed in a self-editable atproto record. It's optional: without it, linking still works, but linked accounts show no "Verified" badge.

Generate a private ES256 key as JWK JSON:

```bash
node -e "import('jose').then(async j => { const {publicKey, privateKey} = await j.generateKeyPair('ES256', {extractable:true}); const jwk = await j.exportJWK(privateKey); jwk.kid = await j.calculateJwkThumbprint(await j.exportJWK(publicKey)); jwk.alg='ES256'; jwk.use='sig'; console.log(JSON.stringify(jwk)); })"
```

and set the output as a single environment variable:

```bash
NUXT_ATTESTATION_PRIVATE_KEY='{"kty":"EC","crv":"P-256",...}'
```

## Project structure

```
app/            # Nuxt app
├── components/ # Vue components
├── composables/# Vue composables (useX.ts)
├── layouts/    # Page layouts
├── lib/        # Forge clients, atproto helpers, search (framework-agnostic)
├── middleware/ # Route middleware
├── pages/      # File-based routing
├── plugins/    # Nuxt plugins
├── types/      # Shared TypeScript types (app/types/forge.ts is the big one)
└── utils/      # Auto-imported utilities

server/         # Nitro server
├── api/        # API routes (OAuth, Tangled proxy, atproto proxy)
├── routes/     # Non-/api routes (.well-known/jwks.json)
└── utils/      # Server-only utilities (cache, attestation, proxy, oauth-providers)

lexicons/       # maintainers.space's own atproto lexicon (space.maintainers.forgeAccount)
```

Each forge (`app/lib/forges/{github,gitlab,codeberg,tangled,gitea,bitbucket,sourcehut}.ts`) implements the same `ForgeProvider` interface defined in `app/types/forge.ts`, mapping that provider's raw API responses into a common set of types (`ForgeRepo`, `ForgeIssue`, `ForgePull`, and so on) so the rest of the app never has to know which forge it's talking to. Registering a new forge is one entry in `app/lib/forges/index.ts` — every cross-forge surface (search, explore, notifications, timeline, home dashboard) iterates that registry generically rather than hardcoding a provider list. Codeberg and Gitea share one implementation (`app/lib/forges/gitea-family.ts`, a factory parameterized by API/web base URL) since both are Gitea-flavored REST APIs; Forgejo could be added the same way later if a good second public instance turns up.

OAuth sign-in is likewise one generic, config-driven flow shared by every forge (Tangled excepted — it signs in via the atproto identity itself, not OAuth): `server/utils/oauth-providers.ts` holds each forge's endpoints/scope/auth-style, `server/api/auth/[provider]/{login,callback}.get.ts` are the only server routes, and `app/composables/useForgeAuth.ts` is the client-side counterpart. Adding a forge's OAuth support means one entry in each of those two files plus a `fetchUser`/`fetchUsername` function — nothing else needs touching, including `settings/accounts.vue`, which builds its list from the forge registry.

## Code style

The project cares about real types. Raw forge API responses get their own interfaces rather than `any`, and inputs that aren't already trustworthy get validated instead of just asserted. Linting and formatting run through [oxlint](https://oxc.rs/docs/guide/usage/linter) and [oxfmt](https://oxc.rs/docs/guide/usage/formatter):

```bash
pnpm lint        # oxlint
pnpm lint:fix     # oxlint --fix
pnpm format       # oxfmt, formats in place
pnpm format:check # oxfmt --check, what CI runs
pnpm typecheck    # nuxt typecheck (vue-tsc)
pnpm knip         # unused files, exports and dependencies
```

Note that oxlint only lints the `<script>` block of `.vue` files. It doesn't currently do Vue template linting (missing `:key` on `v-for`, accessibility attributes, and so on), so pay a little extra attention to templates in review since the linter won't catch everything there yet.

## Pre-commit hooks

The project uses `lint-staged` with `simple-git-hooks` to lint and format staged files automatically on commit. `pnpm install` sets this up for you through the `postinstall` script. A formatting or lint issue that can be fixed automatically will be; anything else blocks the commit and tells you why.

## Submitting changes

Before opening a pull request, run `pnpm lint`, `pnpm typecheck` and `pnpm knip` locally. CI runs all three anyway, but it's faster to catch issues before pushing. Then:

1. Create a feature branch from `main`.
2. Make your changes with clear, descriptive commits.
3. Push your branch and open a pull request, filling in the PR template.
4. Make sure CI passes (lint, format, type check, unused-code check).

PR titles are checked against [Conventional Commits](https://www.conventionalcommits.org) (`type(scope): description`, lowercase subject). This repo doesn't squash-merge by default, so keep individual commit messages meaningful too, not just the PR title. Common types are `feat`, `fix`, `docs`, `refactor`, `chore` and `ci`. Scopes like `ui`, `server`, `forge`, `docs`, `deps` and `ci` are recognized but optional.

If your PR addresses an open issue, mention it in the description (`Fixes #123` or a full issue URL) so GitHub links the two and closes the issue automatically on merge.

## Using AI

You're welcome to use AI tools while contributing. Two ground rules apply. Write PR descriptions, commit messages and issues in your own words. AI-generated summaries tend to run long and occasionally get things wrong, and a short honest description beats an impressive-sounding inaccurate one. Also, understand what you're contributing before you contribute it. If you can't explain why a change works, that's a sign to slow down and actually read it instead of just pasting it in.

## Questions?

Open an issue if something in this guide doesn't match what you're seeing, or if you're not sure where a change should go.
