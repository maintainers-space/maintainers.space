// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@vueuse/nuxt'],

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
    // server/api/chat/enable.post.ts, which mints a fresh account here on
    // "Enable Chat" and hands its one-time credentials back to the client so it
    // can both call social.colibri.community.create (BYO-PDS mode) and write
    // maintainers.space's own repoBinding record, as the caller's own atproto
    // session. Set NUXT_CHAT_PDS_LOC / NUXT_CHAT_PDS_ADMIN_PASS. Defaults match
    // the local docker-compose.pds.dev.yml stack documented in the chat feature plan.
    chat: {
      pdsLoc: 'http://localhost:3000',
      pdsAdminPass: '',
      appviewHandleDomain: 'test'
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
