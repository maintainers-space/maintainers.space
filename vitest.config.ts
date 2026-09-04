import { defineVitestConfig } from '@nuxt/test-utils/config'
import { configDefaults } from 'vitest/config'

export default defineVitestConfig({
  test: {
    environment: 'nuxt',
    exclude: [...configDefaults.exclude, '__e2e__/**'],
    setupFiles: ['./__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      include: [
        'app/composables/useRepoVisits.ts',
        'app/lib/**/*.ts',
        'app/utils/**/*.ts',
        'server/utils/**/*.ts'
      ],
      exclude: ['**/*.test.ts', '**/types.ts'],
      thresholds: {
        lines: 24,
        functions: 16,
        statements: 24,
        branches: 23
      }
    }
  }
})
