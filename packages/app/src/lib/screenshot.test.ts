import { describe, expect, it } from 'vitest';

import { hostOf, isBlankBrowser, readScreenShot } from './screenshot.js';

describe('readScreenShot', () => {
  it('reads a PNG payload', () => {
    expect(readScreenShot({ ok: true, base64: 'abc', url: 'https://example.com' })).toEqual({
      base64: 'abc',
      url: 'https://example.com',
      title: undefined,
    });
  });

  it('returns null without pixels', () => {
    expect(readScreenShot({ ok: true })).toBeNull();
    expect(readScreenShot(null)).toBeNull();
  });

  it('treats a missing URL as a real page and about:blank as empty', () => {
    expect(isBlankBrowser(undefined)).toBe(false);
    expect(isBlankBrowser('about:blank')).toBe(true);
    expect(isBlankBrowser('https://example.com')).toBe(false);
  });

  it('names the host of a page URL', () => {
    expect(hostOf('https://example.com/path')).toBe('example.com');
    expect(hostOf('not a url')).toBe('not a url');
  });
});
