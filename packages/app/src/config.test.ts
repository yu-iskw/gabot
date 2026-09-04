import { describe, expect, it } from 'vitest';

import { parseTurnSse } from './api.js';
import { apiBase, firebaseAuthEmulatorHost, firebaseProjectId } from './config.js';

describe('app helpers', () => {
  it('reads emulator host and project defaults', () => {
    expect(firebaseAuthEmulatorHost({})).toBe('127.0.0.1:9099');
    expect(firebaseProjectId({ VITE_FIREBASE_PROJECT_ID: 'demo-gabot' })).toBe('demo-gabot');
  });

  it('parses turn SSE text', () => {
    const payload =
      'data: {"type":"text","delta":"Opened https://example.com."}\n\ndata: {"type":"done"}\n\n';
    expect(parseTurnSse(payload)).toContain('example.com');
    expect(parseTurnSse('not-sse')).toBe('');
    expect(apiBase({})).toBe('');
    expect(apiBase({ VITE_API_BASE: '/x' })).toBe('/x');
    expect(firebaseAuthEmulatorHost({})).toBe('127.0.0.1:9099');
    expect(apiBase({})).toBe('');
    expect(apiBase({ VITE_API_BASE: '/x' })).toBe('/x');
  });
});
