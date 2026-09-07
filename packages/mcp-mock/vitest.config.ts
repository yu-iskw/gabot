import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: '@gabot/mcp-mock',
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['dist/**'],
  },
});
