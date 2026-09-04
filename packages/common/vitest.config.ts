import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: '@gabot/common',
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['dist/**'],
  },
});
