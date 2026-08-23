import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    fileParallelism: false,
    maxConcurrency: 1,
    isolate: false,
    sequence: {
      concurrent: false,
    },
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
