# koinon

[![Nuxt UI](https://img.shields.io/badge/Made%20with-Nuxt%20UI-00DC82?logo=nuxt&labelColor=020420)](https://ui.nuxt.com)

**koinon** is a multi-forge dashboard that brings your work across Git hosts into one place. It aggregates repositories, issues, pull requests and notifications from **GitHub** and **[Tangled](https://tangled.org)**, using your **AT Protocol** (Bluesky) identity to sign in and to discover accounts across platforms.

Built with [Nuxt](https://nuxt.com) and [Nuxt UI](https://ui.nuxt.com).

## Features

- **AT Protocol sign-in** — log in with any atproto handle or DID (Bluesky, npmx, self-hosted PDS…). No passwords are ever shared with koinon.
- **GitHub via OAuth** — link GitHub with a verified OAuth flow (no personal access tokens).
- **Tangled support** — browse Tangled repos, issues and pulls through a same-origin proxy.
- **Unified notifications** — GitHub and Tangled notifications mixed into one list, each tagged with its forge logo.
- **Following** — see repos from the people and orgs you follow, on any platform.
- **Public profiles** — shareable `/profile/<handle>` pages listing linked accounts, repos and activity.
- **Personalized home** — a signed-in overview of PRs to jump back into, review requests and assigned issues, plus recent/favourite repos ranked by your visit history.

## Architecture

koinon is a Nuxt SPA (`ssr: false`) **with a Nitro server**. The server side is required — it is not a purely static site. `server/api/**` provides:

- `GET /api/auth/github/{login,callback}` — GitHub OAuth (client secret stays server-side).
- `ALL /api/tangled/**` — same-origin proxy for Tangled's XRPC aggregator (which sends no CORS headers).
- `GET /api/atproto/proxy` — guarded relay for public atproto reads (see [Corporate networks](#corporate-networks)).

> **Deployment note:** because of these routes you must deploy the **Nitro server** output (`node .output/server/index.mjs` or a Node-capable host/preset). Do **not** deploy with `nuxt generate` / a static-only host — the API routes would be missing and GitHub/Tangled/proxy features would break.

## Setup

Install dependencies:

```bash
pnpm install
```

### Environment variables

GitHub linking requires a GitHub OAuth app. Create one at **GitHub → Settings → Developer settings → OAuth Apps** with:

- **Authorization callback URL:** `<your-origin>/api/auth/github/callback`
  (e.g. `http://127.0.0.1:3000/api/auth/github/callback` in development)

Then set:

```bash
NUXT_GITHUB_CLIENT_ID=your_client_id
NUXT_GITHUB_CLIENT_SECRET=your_client_secret
```

The requested scope is `read:user read:org notifications public_repo`. Without these variables the app still runs — GitHub linking is simply disabled.

AT Protocol OAuth needs no secrets: in development it uses the loopback `http://localhost` client on `127.0.0.1`; in production the hosted `client-metadata.json` is the client id.

## Development server

> atproto OAuth rejects `localhost` redirect URIs, so the dev server binds to `127.0.0.1`.

```bash
NUXT_GITHUB_CLIENT_ID=... NUXT_GITHUB_CLIENT_SECRET=... pnpm dev
```

Open `http://127.0.0.1:3000`.

## Production

```bash
pnpm build
node .output/server/index.mjs   # serve the Nitro server output
```

Provide `NUXT_GITHUB_CLIENT_ID` / `NUXT_GITHUB_CLIENT_SECRET` in the server environment, and make sure your GitHub OAuth app's callback URL matches the deployed origin.

## Corporate networks

Some corporate proxies block every Bluesky-operated domain. koinon degrades gracefully:

- **Public reads** (identity resolution, profiles, repos, follows) automatically retry through the same-origin relay at `/api/atproto/proxy`, so browsing keeps working even when `*.bsky.*` is blocked in the browser.
- **Sign-in is the exception.** The AT Protocol OAuth flow redirects your browser directly to your account's provider (e.g. `bsky.social`) — a top-level navigation that cannot be proxied. If your network blocks that host, perform the initial sign-in on a different network, or ask IT to allow your PDS / auth server. The login screen shows a hint when this happens.

## Quality checks

```bash
pnpm lint       # ESLint
pnpm typecheck  # nuxt typecheck (vue-tsc)
```

## Renovate integration

Install the [Renovate GitHub app](https://github.com/apps/renovate/installations/select_target) on your repository and you are good to go.
