import { describe, expect, it } from 'vitest';

import { splitSkillChip } from './skill-chip.js';

describe('splitSkillChip', () => {
  it('chips a known slash command at the start of a line', () => {
    expect(splitSkillChip('/summarize the thread', 'summarize,brief')).toEqual({
      chip: 'summarize',
      rest: 'the thread',
    });
  });

  it('leaves an unknown slash as ordinary text', () => {
    expect(splitSkillChip('/etc/hosts is broken', 'summarize')).toBeNull();
  });
});
