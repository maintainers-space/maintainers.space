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
  }
})
