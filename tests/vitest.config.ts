import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'compose',
    include: ['*.test.ts'],
  },
});
