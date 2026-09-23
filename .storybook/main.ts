import { fileURLToPath } from 'node:url'
import type { StorybookConfig } from '@storybook/vue3-vite'
import ui from '@nuxt/ui/vite'
import vue from '@vitejs/plugin-vue'

// Plain Vue + Vite Storybook: @nuxtjs/storybook does not yet support Vite 8 or
// Storybook 10.6. Nuxt UI's Vite plugin supplies Tailwind, component and
// composable auto-imports and the theme, so presentational components render
// as they do in the app. Components that need the Nuxt runtime (routing,
// useFetch, NuxtLink) need mocks before they can have stories.
const config: StorybookConfig = {
  stories: ['../app/**/*.stories.ts'],
  framework: { name: '@storybook/vue3-vite', options: { docgen: 'vue-component-meta' } },
  async viteFinal(config) {
    // app.config.ts calls Nuxt's auto-imported `defineAppConfig`.
    Object.assign(globalThis, { defineAppConfig: <T>(appConfig: T) => appConfig })
    const { default: appConfig } = await import('../app/app.config.ts')

    config.plugins ??= []
    config.plugins.push(
      vue(),
      ui({
        ui: appConfig.ui,
        router: false,
        // Nuxt already generates these types under .nuxt/.
        dts: false,
        autoImport: { imports: ['vue'], dirs: ['app/utils'] }
      })
    )
    config.resolve ??= {}
    config.resolve.alias = {
      ...config.resolve.alias,
      '~': fileURLToPath(new URL('../app', import.meta.url))
    }
    return config
  }
}

export default config
