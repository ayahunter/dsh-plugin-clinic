import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.{ts,tsx}'],
    // Node default; component specs opt into jsdom via the per-file pragma.
    environment: 'node',
    // testing-library auto-cleanup registers on the global afterEach.
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/client/**', 'src/index.ts'],
    },
  },
})
