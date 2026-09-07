import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: '@gabot/scripted-model',
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['dist/**'],
  },
});
