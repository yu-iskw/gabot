import { describe, expect, it } from 'vitest';

import { paneFromSearch, readChannelSearch, searchForPane, searchRecord } from './channel-pane.js';

describe('readChannelSearch', () => {
  it('treats boolean or string true as open', () => {
    expect(readChannelSearch({ settings: 'true' })).toEqual({
      settings: true,
    });
  });

  it('omits flags that are off', () => {
    expect(readChannelSearch({ settings: false })).toEqual({});
  });
});

describe('paneFromSearch', () => {
  it('opens settings when the flag is set', () => {
    expect(paneFromSearch({ settings: true })).toBe('settings');
  });

  it('returns null when the pane is closed', () => {
    expect(paneFromSearch({})).toBeNull();
  });
});

describe('searchForPane', () => {
  it('opens settings or clears the pane', () => {
    expect(searchForPane('settings')).toEqual({ settings: true });
    expect(searchForPane(null)).toEqual({});
  });
});

describe('searchRecord', () => {
  it('reads an object and ignores other values', () => {
    expect(searchRecord({ settings: true })).toEqual({ settings: true });
    expect(searchRecord(null)).toEqual({});
  });
});
