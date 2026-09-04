import { describe, expect, it } from 'vitest';

import { visibleMessages } from './visible-messages.js';

describe('visibleMessages', () => {
  it('hides an assistant line that only restates the previous tool', () => {
    const shown = visibleMessages([
      { id: '1', role: 'user', content: 'please create a bot named Research' },
      { id: '2', role: 'tool', content: 'Created bot Research (agent_1).' },
      { id: '3', role: 'assistant', content: 'Created bot Research (agent_1).' },
    ]);
    expect(shown.map((row) => row.role)).toEqual(['user', 'tool']);
  });

  it('keeps assistant prose that adds something the tool did not say', () => {
    const shown = visibleMessages([
      { id: '1', role: 'tool', content: 'Opened https://example.com' },
      { id: '2', role: 'assistant', content: 'Ready for the next step.' },
    ]);
    expect(shown).toHaveLength(2);
  });
});
