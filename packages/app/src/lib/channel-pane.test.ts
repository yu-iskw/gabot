import { describe, expect, it } from 'vitest';

import { paneFromSearch, readChannelSearch, searchForPane, searchRecord } from './channel-pane.js';

describe('readChannelSearch', () => {
  it('treats boolean or string true as open', () => {
    expect(readChannelSearch({ watch: true, settings: 'true' })).toEqual({
      settings: true,
      watch: true,
    });
  });

  it('omits flags that are off', () => {
    expect(readChannelSearch({ watch: 'false', settings: false })).toEqual({});
  });
});

describe('paneFromSearch', () => {
  it('prefers watch when both flags are set', () => {
    expect(paneFromSearch({ settings: true, watch: true })).toBe('watch');
  });

  it('returns null when the pane is closed', () => {
    expect(paneFromSearch({})).toBeNull();
  });
});

describe('searchForPane', () => {
  it('opens one flag and clears the other', () => {
    expect(searchForPane('settings')).toEqual({ settings: true });
    expect(searchForPane('watch')).toEqual({ watch: true });
    expect(searchForPane(null)).toEqual({});
  });
});

describe('searchRecord', () => {
  it('reads an object and ignores other values', () => {
    expect(searchRecord({ watch: true })).toEqual({ watch: true });
    expect(searchRecord(null)).toEqual({});
  });
});
