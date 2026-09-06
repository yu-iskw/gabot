import { describe, expect, it } from 'vitest';

import { pluginRowSummary } from './grant-summary.js';

describe('pluginRowSummary', () => {
  it('pairs tool count with workspace grants', () => {
    expect(pluginRowSummary(0, 0)).toBe('No tools yet');
    expect(pluginRowSummary(2, 0)).toBe('2 tools · none granted');
    expect(pluginRowSummary(1, 1)).toBe('1 tool · 1 granted');
    expect(pluginRowSummary(2, 1)).toBe('2 tools · 1 granted');
  });
});
