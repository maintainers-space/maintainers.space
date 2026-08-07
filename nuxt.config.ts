// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@vueuse/nuxt', '@vite-pwa/nuxt'],

  ssr: false,

  devtools: {
    enabled: true
  },

  css: [
    '@fontsource-variable/geist/index.css',
    '@fontsource-variable/geist-mono/index.css',
    '~/assets/css/main.css'
  ],

  // Self-hosted Geist via Fontsource — disable @nuxt/fonts remote fetching
  ui: {
    fonts: false
  },

  runtimeConfig: {
    // GitHub OAuth (server-only). Set NUXT_GITHUB_CLIENT_ID / NUXT_GITHUB_CLIENT_SECRET.
    github: {
      clientId: '',
      clientSecret: ''
    },
    // GitLab OAuth (server-only). Set NUXT_GITLAB_CLIENT_ID / NUXT_GITLAB_CLIENT_SECRET.
    gitlab: {
      clientId: '',
      clientSecret: ''
    },
    // Codeberg (Forgejo) OAuth (server-only). Set NUXT_CODEBERG_CLIENT_ID / NUXT_CODEBERG_CLIENT_SECRET.
    codeberg: {
      clientId: '',
      clientSecret: ''
    },
    // Gitea (gitea.com) OAuth (server-only). Set NUXT_GITEA_CLIENT_ID / NUXT_GITEA_CLIENT_SECRET.
    gitea: {
      clientId: '',
      clientSecret: ''
    },
    // Bitbucket Cloud OAuth (server-only). Set NUXT_BITBUCKET_CLIENT_ID / NUXT_BITBUCKET_CLIENT_SECRET.
    bitbucket: {
      clientId: '',
      clientSecret: ''
    },
    // Server-signed forge-account attestations (server-only). A private ES256 key
    // in JWK JSON form; set NUXT_ATTESTATION_PRIVATE_KEY. When empty, linking still
    // works but records carry no verifiable attestation (badge stays unverified).
    attestation: {
      privateKey: ''
    },
    // The PDS that hosts community accounts for the Chat tab (server-only —
    // pdsAdminPass is admin credentials, never exposed to the client). See
    // server/api/chat/mint-account.post.ts, which mints a fresh account here on
    // "Enable Chat" and hands its one-time credentials back to the client so it
    // can both call social.colibri.community.create (BYO-PDS mode) and write
    // maintainers.space's own repoBinding record, as the caller's own atproto
    // session. Set NUXT_CHAT_PDS_LOC / NUXT_CHAT_PDS_ADMIN_PASS. The default
    // port is the local dev PDS's own, deliberately not 3000, which devServer
    // below already binds for the app itself.
    chat: {
      pdsLoc: 'http://localhost:2583',
      pdsAdminPass: '',
      appviewHandleDomain: 'test'
    },
    public: {
      // OAuth client id for production; overridden per-env. Empty => localhost dev client.
      atprotoClientId: '',
      appUrl: '',
      // The AppView's canonical identity. Its host becomes the `did:web` that
      // permission-set scopes and service-auth `aud`s pin to, so it MUST be a
      // host a PDS can resolve. A loopback address here silently breaks chat: the
      // PDS drops every `include:` scope whose `aud` it cannot resolve, granting
      // the rest, so the only symptom is the embed reporting missing permissions.
      colibriAppviewUrl: 'https://api.colibri.social',
      // Where AppView traffic is actually sent, when that differs from the
      // identity above. Set NUXT_PUBLIC_COLIBRI_APPVIEW_DIAL_URL to a local
      // AppView for development. Note that under `nuxt dev` the embed redirects
      // its own traffic to http://127.0.0.1:8000 regardless, via
      // `import.meta.env.DEV`, so this only redirects our own XRPC calls.
      colibriAppviewDialUrl: ''
    }
  },

  routeRules: {
    '/api/**': {
      cors: true
    },
    // Voice channels in the Chat tab call getUserMedia for mic and camera and
    // getDisplayMedia for screen sharing. `self` is already the default
    // allowlist for all three, so this grants nothing extra. It is here so a
    // host or edge proxy that injects a stricter default cannot silently break
    // voice, and so the requirement is visible in config rather than only in
    // @colibri-social/client's docs.
    '/**': {
      headers: {
        'Permissions-Policy': 'microphone=(self), camera=(self), display-capture=(self)'
      }
    }
  },

  // Prerender the (route-agnostic, since ssr:false) app shell to a static
  // index.html so the service worker has something concrete to precache and
  // fall back to when navigating offline — see the `pwa` config below.
  nitro: {
    prerender: {
      routes: ['/']
    }
  },

  // Installable, offline-first PWA shell: the built app (JS/CSS/HTML/fonts)
  // is precached by the service worker so the SPA shell loads with zero
  // connectivity, and every route falls back to it when offline. Actual data
  // (repos, issues, notifications, …) is persisted separately in IndexedDB by
  // ~/lib/cache — the service worker only caches `/api/**` reads (this
  // server's own proxies) as a second line of defense; it deliberately never
  // touches direct, token-authenticated calls to the forges themselves, which
  // are per-user and must not be shared across accounts on the same device.
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'maintainers.space — one place for every forge',
      short_name: 'maintainers.space',
      description:
        'Browse repositories across GitHub and Tangled, and link your forge accounts to your AT Protocol identity.',
      start_url: '/',
      display: 'standalone',
      theme_color: '#eab308',
      background_color: '#1b1718',
      icons: [
        { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        {
          src: 'maskable-icon-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable'
        }
      ]
    },
    workbox: {
      // Without an explicit glob, nothing under `_nuxt/` (the actual JS/CSS
      // app bundle) gets precached — the module doesn't default this itself.
      globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest,woff,woff2}'],
      // The Chat tab lazy-loads @colibri-social/client, which bundles voice and
      // video and lands in one ~4MB chunk. Rolldown names chunks by hash alone,
      // so no glob reliably matches it and globIgnores is not an option.
      // Filtering the manifest by size keeps it, and any future outsized chunk,
      // out of the service worker install without depending on a filename.
      //
      // maximumFileSizeToCacheInBytes has to be raised past that chunk first:
      // workbox's own size check runs before manifestTransforms, and
      // vite-plugin-pwa treats its "won't be precached" warning as a fatal
      // build error. The real limit is the filter below.
      maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
      manifestTransforms: [
        (entries) => ({
          manifest: entries.filter((entry) => (entry.size ?? 0) <= 2_000_000),
          warnings: []
        })
      ],
      navigateFallback: '/',
      // OAuth handshakes are one-shot, must always hit the network, and must
      // never be served from (or written to) the cache.
      // `/twemoji/**` and `/noise/**` are proxied binary assets, so a direct hit
      // on one is a navigation request as far as workbox is concerned and would
      // otherwise be answered with the cached app shell.
      navigateFallbackDenylist: [/^\/oauth\//, /^\/api\//, /^\/twemoji\//, /^\/noise\//],
      runtimeCaching: [
        {
          // Emoji images for the Chat tab, proxied by
          // server/routes/twemoji/[...path].get.ts. Immutable per codepoint and
          // requested many times per message list, so cache-first and keep them
          // across sessions. Deliberately not applied to `/noise/**`, whose two
          // files are ~24MB together and are better left to the HTTP cache.
          urlPattern: /^\/twemoji\//,
          handler: 'CacheFirst',
          options: {
            cacheName: 'twemoji-cache',
            expiration: { maxEntries: 600, maxAgeSeconds: 31_536_000 },
            cacheableResponse: { statuses: [0, 200] }
          }
        },
        {
          // This server's own read proxies (search, graph, tangled, github
          // actions-log) — never `/api/auth/**`, whose OAuth redirects must
          // always hit the network fresh.
          urlPattern: /^\/api\/(?!auth\/)/,
          handler: 'NetworkFirst',
          options: {
            cacheName: 'api-cache',
            networkTimeoutSeconds: 8,
            expiration: { maxEntries: 200, maxAgeSeconds: 86_400 },
            cacheableResponse: { statuses: [0, 200] }
          }
        }
      ]
    },
    devOptions: {
      enabled: true,
      type: 'module'
    }
  },

  devServer: {
    host: '127.0.0.1',
    port: 3000
  },

  vite: {
    optimizeDeps: {
      // Both are reached only from the lazily-mounted chat embed, so Vite's
      // startup scanner never sees them and defers the whole graph to on-demand
      // discovery on first navigation to the chat route, which invalidates the
      // module graph mid-session and forces a full reload. Pre-bundling makes
      // dev startup deterministic instead.
      include: ['@colibri-social/client/embed', '@atproto/api']
    }
  },

  compatibilityDate: '2026-06-30',

  // Local icon collection (prefix "maintainers-space") for brand marks Iconify
  // doesn't ship — e.g. the official Tangled "dolly" logo at
  // app/assets/icons/tangled.svg → usable anywhere as `i-maintainers-space-tangled`.
  icon: {
    customCollections: [{ prefix: 'maintainers-space', dir: './app/assets/icons' }],
    // The Tangled mark is referenced dynamically (via forge.icon), so pin it
    // into the client bundle — static scanning alone can't discover it.
    clientBundle: {
      icons: ['maintainers-space:tangled'],
      scan: true
    }
  }
})
