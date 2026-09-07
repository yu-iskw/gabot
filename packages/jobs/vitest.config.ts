import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: '@gabot/jobs',
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['dist/**'],
  },
});
