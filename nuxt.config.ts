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
    // Deployment-preview origins allowed to receive OAuth tokens after signing in
    // through production (server-only). Comma-separated `https://` origins; a
    // leading `*.` matches subdomains. Set NUXT_OAUTH_PREVIEW_ORIGINS. Empty => off.
    oauth: {
      previewOrigins: ''
    },
    // Social preview images (server-only). An optional GitHub token for the server's own reads,
    // so previews draw on its 5,000 requests an hour instead of the anonymous 60. Any token with
    // no scopes works. Set NUXT_OG_GITHUB_TOKEN.
    og: {
      githubToken: ''
    },
    public: {
      // OAuth client id for production; overridden per-env. Empty => localhost dev client.
      atprotoClientId: '',
      appUrl: '',
      // The Colibri AppView behind Community. Its host becomes the `did:web` that Colibri's
      // permission sets and service-auth tokens pin to, so it must be a host a PDS can resolve: a
      // PDS silently drops every `include:` scope whose audience it cannot resolve. Set
      // NUXT_PUBLIC_COLIBRI_APPVIEW_URL.
      colibriAppviewUrl: 'https://api.colibri.social',
      // Where our own AppView calls go when that differs from the identity above, e.g. a local
      // AppView in development. Set NUXT_PUBLIC_COLIBRI_APPVIEW_DIAL_URL.
      colibriAppviewDialUrl: ''
    }
  },

  routeRules: {
    '/api/**': {
      cors: true,
      headers: { 'x-robots-tag': 'noindex, nofollow' }
    },
    '/bitbucket/**': { headers: { 'x-robots-tag': 'noindex, nofollow' } },
    '/codeberg/**': { headers: { 'x-robots-tag': 'noindex, nofollow' } },
    '/gitea/**': { headers: { 'x-robots-tag': 'noindex, nofollow' } },
    '/github/**': { headers: { 'x-robots-tag': 'noindex, nofollow' } },
    '/gitlab/**': { headers: { 'x-robots-tag': 'noindex, nofollow' } },
    '/login': { headers: { 'x-robots-tag': 'noindex, nofollow' } },
    '/notifications': { headers: { 'x-robots-tag': 'noindex, nofollow' } },
    '/notifications/**': { headers: { 'x-robots-tag': 'noindex, nofollow' } },
    '/oauth/**': { headers: { 'x-robots-tag': 'noindex, nofollow' } },
    '/profile': { headers: { 'x-robots-tag': 'noindex, nofollow' } },
    '/profile/**': { headers: { 'x-robots-tag': 'noindex, nofollow' } },
    '/search': { headers: { 'x-robots-tag': 'noindex, nofollow' } },
    '/search/**': { headers: { 'x-robots-tag': 'noindex, nofollow' } },
    '/settings': { headers: { 'x-robots-tag': 'noindex, nofollow' } },
    '/settings/**': { headers: { 'x-robots-tag': 'noindex, nofollow' } },
    '/tangled/**': { headers: { 'x-robots-tag': 'noindex, nofollow' } },
    '/timeline': { headers: { 'x-robots-tag': 'noindex, nofollow' } },
    '/community/**': { headers: { 'x-robots-tag': 'noindex, nofollow' } },
    // Voice channels in a Community use the microphone, camera and screen sharing. `self` is the
    // default already; this keeps a host that injects a stricter policy from breaking voice.
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
        'Browse repositories on GitHub, GitLab, Codeberg, Gitea, Bitbucket and Tangled, and link your forge accounts to your AT Protocol identity.',
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
      // The Community embed bundles voice and video into one chunk of about 4 MB, which Rolldown
      // names by hash alone. Filtering by size keeps it, and any future outsized chunk, out of the
      // install. Workbox checks its own limit before the transform and the PWA plugin fails the
      // build on that warning, so the limit is raised and the filter does the real work.
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
      // `/twemoji/**` and `/noise/**` are proxied assets for Community, which workbox would
      // otherwise answer with the app shell when opened directly.
      navigateFallbackDenylist: [/^\/oauth\//, /^\/api\//, /^\/twemoji\//, /^\/noise\//],
      runtimeCaching: [
        {
          // Community's emoji, proxied by server/routes/twemoji. Immutable per codepoint.
          urlPattern: /^\/twemoji\//,
          handler: 'CacheFirst',
          options: {
            cacheName: 'twemoji-cache',
            expiration: { maxEntries: 600, maxAgeSeconds: 31_536_000 },
            cacheableResponse: { statuses: [0, 200] }
          }
        },
        {
          // This server's own read proxies (search, tangled, github actions-log)
          // — never `/api/auth/**`, whose OAuth redirects must always hit the
          // network fresh.
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
      // Reached only from the lazily mounted Community embed, so Vite's scanner would discover
      // them on first navigation and reload the page mid-session.
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
