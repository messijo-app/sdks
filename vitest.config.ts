import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
    fileParallelism: false,
    include: ['packages/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
