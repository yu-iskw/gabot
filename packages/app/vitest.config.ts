import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: '@gabot/app',
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['dist/**'],
  },
});
