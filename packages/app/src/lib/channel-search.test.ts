import { describe, expect, it } from 'vitest';

import { matchingChannels } from './channel-search.js';

const channels = [
  { name: 'General', lastMessage: 'Opened example.com' },
  { name: 'Research', lastMessage: null },
];

describe('matchingChannels', () => {
  it('returns the same array when the query is empty', () => {
    expect(matchingChannels(channels, '')).toBe(channels);
  });

  it('matches name or last message', () => {
    expect(matchingChannels(channels, 'research')).toEqual([channels[1]]);
    expect(matchingChannels(channels, 'example')).toEqual([channels[0]]);
  });

  it('returns empty for an undefined roster', () => {
    expect(matchingChannels(undefined, 'x')).toEqual([]);
  });
});
