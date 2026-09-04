import { describe, expect, it } from 'vitest';

import { grantSummary, pluginRowSummary } from './grant-summary.js';

describe('grantSummary', () => {
  it('names the ends and counts the middle', () => {
    expect(grantSummary(0, 3)).toBe('No Bots');
    expect(grantSummary(1, 1)).toBe('1 Bot');
    expect(grantSummary(3, 3)).toBe('All Bots');
    expect(grantSummary(1, 3)).toBe('1 of 3 Bots');
  });
});

describe('pluginRowSummary', () => {
  it('pairs tool count with how widely they are held', () => {
    expect(pluginRowSummary(0, 0)).toBe('No tools yet');
    expect(pluginRowSummary(2, 0)).toBe('2 tools · no Bots');
    expect(pluginRowSummary(1, 1)).toBe('1 tool · 1 Bot');
    expect(pluginRowSummary(2, 3)).toBe('2 tools · 3 Bots');
  });
});
