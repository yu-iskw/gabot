import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: '@gabot/supervisor',
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['dist/**'],
  },
});
