import type { KnipConfig } from 'knip'

const config: KnipConfig = {
  entry: [
    'app/pages/**/*.vue',
    'app/plugins/**/*.ts',
    'app/middleware/**/*.ts',
    'server/api/**/*.ts'
  ],
  project: ['app/**/*.{ts,vue}', 'server/**/*.ts'],
  ignoreExportsUsedInFile: true,
  // Optional external CLI; intentionally not installed as a project dependency.
  ignoreBinaries: ['coderabbit'],
  ignoreDependencies: [
    // Nuxt module-only deps: consumed via nuxt.config.ts modules/css, not imported in app code.
    '@iconify-json/lucide',
    '@iconify-json/simple-icons',
    '@fontsource-variable/geist',
    '@fontsource-variable/geist-mono',
    // CLI-only: invoked by `nuxt typecheck`, never imported.
    'vue-tsc'
  ]
}

export default config
