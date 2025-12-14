import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['./test/unit/setup.js'],
    include: ['test/unit/**/*.test.js']
  }
});

