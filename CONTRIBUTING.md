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
  - [App URL](#app-url)
  - [Attestation signing key](#attestation-signing-key)
  - [Chat (Colibri)](#chat-colibri)
    - [How chat permissions are granted](#how-chat-permissions-are-granted)
    - [Enabling chat for a repo](#enabling-chat-for-a-repo)
    - [Letting the app see your organisation](#letting-the-app-see-your-organisation)
    - [Two dependency constraints the embed needs](#two-dependency-constraints-the-embed-needs)
    - [Assets the embed expects this origin to serve](#assets-the-embed-expects-this-origin-to-serve)
    - [When chat misbehaves](#when-chat-misbehaves)
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

Signing in with atproto needs no configuration in development: it uses a loopback OAuth client scoped to `127.0.0.1`. Linking a GitHub, GitLab, Codeberg, Gitea or Bitbucket account is opt-in per provider. The app runs fine with none of them configured, it just disables linking for whichever provider you haven't set up. If you're working on something that touches one of those forges, set up that provider's OAuth app using the instructions below and export its client ID and secret before running `pnpm dev`:

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

[gitea.com](https://gitea.com) is Gitea's own hosted community instance (same Gitea-flavored REST API as Codeberg, just a different host — `app/lib/forges/gitea-shared/` implements both). Create an application at [gitea.com/user/settings/applications](https://gitea.com/user/settings/applications), with the redirect URI set to:

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

Unlike the other forges, Bitbucket's token exchange authenticates with HTTP Basic auth rather than a client id/secret in the request body — already handled generically by `tokenAuthStyle: 'basic'` in `server/utils/oauth-providers.ts`. Bitbucket's issue tracker isn't integrated (Atlassian is removing it), and there's no notifications, activity-feed, or follow-graph API to integrate at all — see the comment at the top of `app/lib/forges/bitbucket/index.ts` for the full list of verified platform limits. Set:

```bash
NUXT_BITBUCKET_CLIENT_ID=your_key
NUXT_BITBUCKET_CLIENT_SECRET=your_secret
```

### App URL

Not a forge app either. `NUXT_PUBLIC_APP_URL` is the origin this deployment serves from, and it's the only origin whose forge-account attestations the server will trust. With it unset the trusted set is empty and **every attestation is rejected**, which shows up as a 503 telling you to set this variable.

```bash
NUXT_PUBLIC_APP_URL=http://127.0.0.1:3000        # development
NUXT_PUBLIC_APP_URL=https://maintainers.space    # production
```

It has to match the `attestedBy` recorded on the `space.maintainers.forgeAccount` record. That value is the request origin at the moment the account was linked, not this variable, so an account linked against `127.0.0.1:3000` will not verify on a deployment configured for `maintainers.space`. Reconnecting the account re-mints the attestation against whichever origin you're running.

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

### Chat (Colibri)

The Chat tab on a repo page embeds [`@colibri-social/client`](https://github.com/colibri-social/colibri.social) against a Colibri AppView. Every repo under an owner shares one community.

Reading an existing chat needs only an AppView. Creating one also needs a PDS this server can mint community accounts on:

```bash
NUXT_PUBLIC_COLIBRI_APPVIEW_URL=https://api.colibri.social
NUXT_PUBLIC_COLIBRI_APPVIEW_DIAL_URL=http://127.0.0.1:8000
NUXT_CHAT_PDS_LOC=http://localhost:2583
NUXT_CHAT_PDS_ADMIN_PASS=...
NUXT_CHAT_APPVIEW_HANDLE_DOMAIN=test
```

Those two AppView variables are not interchangeable, and confusing them is the single easiest way to break chat.

`NUXT_PUBLIC_COLIBRI_APPVIEW_URL` is the AppView's **identity**. Its host becomes the `did:web` that Colibri's OAuth permission sets and every service-auth `aud` pin to, so it has to be a host **the PDS** can resolve. Point it at a local AppView and a PDS will resolve nothing, silently drop all five `include:` scopes, and grant the rest. Nothing errors. The only symptom is chat insisting it needs permissions you just approved, and the granted scope in `localStorage['atcute-oauth:sessions']` quietly missing every `include:` entry.

`NUXT_PUBLIC_COLIBRI_APPVIEW_DIAL_URL` is where traffic goes, and is what you point at a local AppView. `@colibri-social/client` draws the same distinction internally: its `getAppViewDid` always derives from the canonical URL, while only `getAppViewHost` branches on `import.meta.env.DEV`.

That `DEV` branch is worth knowing about on its own. It ships unreplaced in the published bundle, so under `pnpm dev` the embed sends its own traffic to `http://127.0.0.1:8000` no matter what either variable says, while `pnpm build` uses the identity URL. The dial variable therefore only redirects the XRPC calls this app makes itself, which is creating a community and its channels. The two commands genuinely exercise different code paths, so test both.

#### How chat permissions are granted

Chat needs Colibri's five published permission sets, and the embed blocks its whole UI if any one is missing. Those are **not** requested at sign-in. `shared/utils/oauth-scope.ts` splits the scope in two:

- `baseScope()` is what signing in asks for, being `atproto` plus the two record collections this app writes.
- `chatScope()` adds everything from the client's own `buildScopes()`, and is requested only when someone opens the Chat tab and presses "Approve chat access".

So nobody grants access to their messages for a feature they never use, and the sign-in consent screen stays small. The trade is that opening chat for the first time always costs one extra consent, which is expected behaviour rather than a stale session.

That approval is an in-place re-authorization (`useAuth().requestScopes`), not a sign out and back in. The identity carries over, so nobody retypes a handle, and abandoning the consent screen leaves the existing session intact. The page to return to rides in `sessionStorage` under `maintainers.space:oauth-return-to`, because the redirect leaves the SPA entirely and in-memory state does not survive it.

Both client metadata paths still declare the **full** scope, in `getOAuthMetadata()`'s loopback `client_id` and in `server/routes/client-metadata.json.get.ts`. An authorization request may narrow what its client declares but never exceed it, so declaring only the base scope would make the chat request invalid.

Whether chat may run is decided from the scope the PDS actually **granted** (`useAuth().grantedScope`, which reads `agent.session.token.scope`), never from what was requested. The two differ: a PDS expands `include:` permission sets into the concrete permissions they cover. The client's own `getMissingScopeSets` matches against those expanded lexicon names, so feeding it a requested scope reports every set as missing.

#### Enabling chat for a repo

Two routes, both in the Chat tab's empty state. "Create a chat" mints a community account and provisions default channels. "Link an existing community" takes the DID of a community you already run, and the server reads that community repo's protected Owner role straight from its PDS and refuses unless you hold it.

Either way you must prove you control the repo's owner:

- **Your own repos**: the signed attestation on your linked forge account is enough, since the owner is your own verified username.
- **Organisation repos**: it can't be, because an OAuth app has no standing to inspect an org and the attestation only says which account you control. Your forge token is forwarded for one request and the forge is asked what _your_ role in that org is. Owner/admin is required. Implemented for GitHub, GitLab and Bitbucket. Codeberg and Gitea report "not supported yet" rather than guessing at a permission check, and self-hosted hosts are refused because the endpoints are fixed canonical URLs.

#### Letting the app see your organisation

GitHub will refuse to report your role until the app is allowed to see the organisation, **even if you are an owner**. Which fix applies depends on what kind of app you registered:

- **OAuth App** (listed under [settings/developers](https://github.com/settings/developers)): organisations can restrict third-party access. Grant it from your own authorization page at `https://github.com/settings/connections/applications/<client_id>` under "Organization access" (owners see "Grant", others see "Request"), or approve a pending request org-side at `https://github.com/organizations/<org>/settings/oauth_application_policy`. Tokens already issued gain access once granted.
- **GitHub App** (listed under [settings/apps](https://github.com/settings/apps), client IDs starting `Ov23li`/`Iv1.`): there is no OAuth application policy. Install the app on the organisation and give it the **Organization permissions → Members: Read** permission, and note that existing installations have to accept a newly added permission. Note that GitHub Apps ignore OAuth scopes entirely, so the `read:org` in `server/utils/oauth-providers.ts` does nothing for them.

When the check fails, the error names the reason rather than defaulting to "you aren't an admin", and the dev server logs `[chat] org admin check denied` with the HTTP status and the token's granted scopes. An empty `scopes=` there means a GitHub App user-to-server token, since those carry no `x-oauth-scopes` header.

#### Two dependency constraints the embed needs

Both look like tidying-up candidates and are not. Removing either breaks chat in a way that does not obviously point back here.

**One copy of `@atproto/api`.** The embed takes an `Agent` **instance** that `ColibriEmbed.vue` constructs, so both sides have to mean the same class. `@colibri-social/client` declares a range wide enough to resolve separately from ours, which leaves two copies whose `Agent` types are not assignable and whose private fields are mutually inaccessible. `pnpm-workspace.yaml` carries an `overrides` entry pinning one version. `pnpm dedupe` does not achieve this on its own, because the client is installed from a URL dependency whose subtree keeps its own resolution.

**`vite.optimizeDeps.include` for the embed.** The embed is reached only from a lazily mounted component, so Vite's startup scanner never sees it and defers the whole 200-package graph to on-demand discovery on first navigation to chat. That re-optimize invalidates the module graph mid-session and forces a full reload. Listing `@colibri-social/client/embed` and `@atproto/api` there makes dev startup deterministic instead.

#### Assets the embed expects this origin to serve

`@colibri-social/client` deliberately points two asset paths at the embedder's own origin instead of a CDN, so a chat user's browser never makes a third-party request. Nothing serves them by default, so both are proxied here:

| Route                      | Serves                                | Upstream                              |
| -------------------------- | ------------------------------------- | ------------------------------------- |
| `/twemoji/**`              | emoji images, `72x72/<codepoint>.png` | `cdn.jsdelivr.net/gh/jdecked/twemoji` |
| `/noise/deepfilternet3/**` | the DeepFilterNet wasm and model      | `cdn.mezon.ai`                        |

Both live in `server/routes/`, share `proxyAsset()` in `server/utils/asset-proxy.ts`, and take their upstreams and path allowlists from `server/utils/embed-assets.ts`.

Three things about them are load-bearing.

**The allowlists are a security boundary, not tidiness.** A catch-all route that forwards whatever path it is given is an open proxy, and one that forwards a whole URL is an SSRF. Twemoji paths must match a codepoint filename pattern, and DeepFilterNet accepts exactly the two paths its loader requests. `server/utils/embed-assets.test.ts` covers the traversal and absolute-URL cases.

**`Range` is forwarded.** The client validates the model by requesting `bytes=0-1` and checking the gzip magic number, so swallowing the header would turn a 2-byte check into a 7.6 MB download on every voice join.

**The pinned twemoji version must match `@twemoji/api`'s own default.** The embed generates codepoints with that build, so proxying a different asset set would 404 exactly the emoji the two versions disagree on. A test reads the installed package and asserts they agree, so upgrading the embed cannot silently repoint the emoji set.

Emoji get a `CacheFirst` service-worker rule since they are immutable per codepoint and requested many times per message list. DeepFilterNet deliberately does not, because its two files are about 24 MB together and the HTTP cache is the right place for them. Both paths are in `navigateFallbackDenylist`, because a direct hit on one is a navigation request as far as workbox is concerned and would otherwise be answered with the cached app shell.

Note that proxying moves the third-party dependency from the browser to this server rather than removing it. Neither file is on npm, and `deepfilternet3-noise-filter` ships no binaries at all, so there is no self-contained option short of vendoring about 34 MB into the deploy.

#### When chat misbehaves

Read the scope the PDS granted, which is the single most useful thing to check first:

```js
JSON.stringify(JSON.parse(localStorage['atcute-oauth:sessions'])).match(/"scope":"[^"]*"/g)
```

Expanded `social.colibri.*` lexicon names mean the permission sets were granted. Missing `include:` entries mean they were not, and the AppView identity variable above is the first thing to check.

Three signals look informative and are not, so do not spend time on them:

- A PDS's `scopes_supported` in `/.well-known/oauth-authorization-server` lists only `atproto` and three legacy `transition:*` scopes on every deployment, including `bsky.social`. It says nothing about granular scope support.
- `/oauth/par` accepts any scope string at all, including outright nonsense, because it only stores the request. A 201 there proves nothing about what will be granted.
- The version at `/xrpc/_health` is the `ghcr.io/bluesky-social/pds` image version, which does not correspond to `@atproto/pds` versions on npm. Comparing them suggests a fork that is not there.

Two error shapes worth recognising, because they point in completely different directions:

- `can't access private field or method: object is not the right class` means a class instance reached code through a proxy. Vue's `readonly()` is a deep runtime proxy, so it must never wrap an object whose methods read `#private` fields. `useAuth()` exposes the agent with `shallowReadonly` for exactly this reason. The tell is that mounting succeeds and then every request fails, because plain properties read fine through a proxy and only method calls touching private state break.
- An `InvalidRequest` carrying a message from the AppView is an ordinary XRPC failure, and points at the AppView or at a service-auth `aud` mismatch instead.

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
├── api/        # API routes (OAuth, Tangled proxy, atproto proxy, chat)
├── routes/     # Non-/api routes (.well-known/jwks.json, client-metadata.json)
└── utils/      # Server-only utilities (cache, attestation, proxy, oauth-providers, chat)

shared/         # Auto-imported by both app/ and server/ (Colibri AppView + scope derivation)

lexicons/       # maintainers.space's own atproto lexicons (forgeAccount, chat.repoBinding)
```

Each forge implements the same `ForgeProvider` interface defined in `app/types/forge.ts`, mapping that provider's raw API responses into a common set of types (`ForgeRepo`, `ForgeIssue`, `ForgePull`, and so on) so the rest of the app never has to know which forge it's talking to. Registering a new forge is one entry in `app/lib/forges/index.ts` — every cross-forge surface (search, explore, notifications, timeline, home dashboard) iterates that registry generically rather than hardcoding a provider list.

GitHub, GitLab, Tangled and Bitbucket each live in their own folder (`app/lib/forges/{github,gitlab,tangled,bitbucket}/`), split the same way:

```
app/lib/forges/github/
├── types.ts    # raw *Response interfaces for that forge's API
├── mappers.ts  # pure map*() functions + stateless helpers (no network calls)
└── index.ts    # fetch/auth helpers + the exported ForgeProvider object
```

Codeberg and Gitea share one implementation (`app/lib/forges/gitea-shared/`, following the same `types.ts`/`mappers.ts`/`index.ts` split behind a `createGiteaFamilyProvider(config)` factory parameterized by API/web base URL) since both are Gitea-flavored REST APIs; Forgejo could be added the same way later if a good second public instance turns up. `app/lib/forges/codeberg.ts` and `app/lib/forges/gitea.ts` are each just that factory called once with their instance's config — genuinely small, real files, not stubs.

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
pnpm test         # vitest run
pnpm test:watch   # vitest, watch mode
```

Tests are colocated as `*.test.ts` next to the file they cover (e.g. `app/lib/search/parser.test.ts`, `app/lib/forges/github/mappers.test.ts`), using [Vitest](https://vitest.dev) with `@nuxt/test-utils`'s Nuxt environment so both plain `lib/` modules and Nuxt-auto-import-dependent composables work the same way.

Note that oxlint only lints the `<script>` block of `.vue` files. It doesn't currently do Vue template linting (missing `:key` on `v-for`, accessibility attributes, and so on), so pay a little extra attention to templates in review since the linter won't catch everything there yet.

## Pre-commit hooks

The project uses `lint-staged` with `simple-git-hooks` to lint and format staged files automatically on commit. `pnpm install` sets this up for you through the `postinstall` script. A formatting or lint issue that can be fixed automatically will be; anything else blocks the commit and tells you why.

## Submitting changes

Before opening a pull request, run `pnpm lint`, `pnpm typecheck`, `pnpm knip` and `pnpm test` locally. CI runs all of these anyway (plus a production build), but it's faster to catch issues before pushing. Then:

1. Create a feature branch from `main`.
2. Make your changes with clear, descriptive commits.
3. Push your branch and open a pull request, filling in the PR template.
4. Make sure CI passes (lint, format, type check, unused-code check, tests, build).

PR titles are checked against [Conventional Commits](https://www.conventionalcommits.org) (`type(scope): description`, lowercase subject). This repo doesn't squash-merge by default, so keep individual commit messages meaningful too, not just the PR title. Common types are `feat`, `fix`, `docs`, `refactor`, `chore` and `ci`. Scopes like `ui`, `server`, `forge`, `docs`, `deps` and `ci` are recognized but optional.

If your PR addresses an open issue, mention it in the description (`Fixes #123` or a full issue URL) so GitHub links the two and closes the issue automatically on merge.

## Using AI

You're welcome to use AI tools while contributing. Two ground rules apply. Write PR descriptions, commit messages and issues in your own words. AI-generated summaries tend to run long and occasionally get things wrong, and a short honest description beats an impressive-sounding inaccurate one. Also, understand what you're contributing before you contribute it. If you can't explain why a change works, that's a sign to slow down and actually read it instead of just pasting it in.

## Questions?

Open an issue if something in this guide doesn't match what you're seeing, or if you're not sure where a change should go.
