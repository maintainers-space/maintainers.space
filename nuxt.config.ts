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
    public: {
      // OAuth client id for production; overridden per-env. Empty => localhost dev client.
      atprotoClientId: '',
      // The deployment's own canonical URL (NUXT_PUBLIC_SITE_URL) — used as the
      // trusted-issuer origin for attestation verification and as the origin
      // for OG image/meta URLs baked into the prerendered `/` shell, which has
      // no real request to read one from at build time.
      siteUrl: ''
    }
  },

  routeRules: {
    '/api/**': {
      cors: true
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
      navigateFallback: '/',
      // OAuth handshakes are one-shot, must always hit the network, and must
      // never be served from (or written to) the cache.
      navigateFallbackDenylist: [/^\/oauth\//, /^\/api\//],
      runtimeCaching: [
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
