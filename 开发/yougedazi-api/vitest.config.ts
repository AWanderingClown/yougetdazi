import { config } from 'dotenv'
import { defineConfig } from 'vitest/config'

// Load .env.test BEFORE any module imports to ensure env vars are available
config({ path: '.env.test' })

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    testTimeout: 60000,
    hookTimeout: 60000,
    setupFiles: ['./tests/setup.ts'],
    env: {},
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true, // Run tests sequentially
      },
    },
    sequence: {
      concurrent: false,
      shuffle: false,
    },
    fileParallelism: false,
    maxConcurrency: 1,
  },
})
