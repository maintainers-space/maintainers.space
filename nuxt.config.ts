// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@vueuse/nuxt'
  ],

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
    // Server-signed forge-account attestations (server-only). A private ES256 key
    // in JWK JSON form; set NUXT_ATTESTATION_PRIVATE_KEY. When empty, linking still
    // works but records carry no verifiable attestation (badge stays unverified).
    attestation: {
      privateKey: ''
    },
    public: {
      // OAuth client id for production; overridden per-env. Empty => localhost dev client.
      atprotoClientId: '',
      appUrl: ''
    }
  },

  routeRules: {
    '/api/**': {
      cors: true
    }
  },

  devServer: {
    host: '127.0.0.1',
    port: 3000
  },

  compatibilityDate: '2026-06-30',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  // Local icon collection (prefix "koinon") for brand marks Iconify doesn't
  // ship — e.g. the official Tangled "dolly" logo at app/assets/icons/tangled.svg
  // → usable anywhere as `i-koinon-tangled`.
  icon: {
    customCollections: [
      { prefix: 'koinon', dir: './app/assets/icons' }
    ],
    // The Tangled mark is referenced dynamically (via forge.icon), so pin it
    // into the client bundle — static scanning alone can't discover it.
    clientBundle: {
      icons: ['koinon:tangled'],
      scan: true
    }
  }
})
