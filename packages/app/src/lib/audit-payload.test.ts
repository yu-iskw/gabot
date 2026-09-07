import { describe, expect, it } from 'vitest';

import { readAuditPayload } from './audit-payload.js';

describe('readAuditPayload', () => {
  it('reads an object payload', () => {
    expect(readAuditPayload({ rule: 'contains(page.host, "example.com")' }).rule).toBe(
      'contains(page.host, "example.com")',
    );
  });

  it('parses a JSON string payload', () => {
    expect(readAuditPayload('{"reason":"MCP tool echo on mock is not granted."}').reason).toBe(
      'MCP tool echo on mock is not granted.',
    );
  });

  it('returns empty for junk', () => {
    expect(readAuditPayload('nope')).toEqual({});
    expect(readAuditPayload(null)).toEqual({});
  });
});
