import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: '@gabot/api',
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['dist/**'],
  },
});
