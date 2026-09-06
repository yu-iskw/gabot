import { describe, expect, it } from 'vitest';

import { identityKeyEquals, parseIdentityKey, serializeIdentityKey } from './identity-key.js';

const ISSUER = 'https://idp.example/realms/gabot';
const OTHER_ISSUER = 'https://idp.other.example/realms/gabot';

describe('parseIdentityKey', () => {
  it('uses issuer tenant and subject as the join key', () => {
    const result = parseIdentityKey({
      email: 'same@example.com',
      issuer: ISSUER,
      subject: 'sub-1',
      tenant: 'acme',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        issuer: ISSUER,
        subject: 'sub-1',
        tenant: 'acme',
      });
      expect(serializeIdentityKey(result.value)).not.toContain('same@example.com');
    }
  });

  it('treats people with the same email and different subjects as distinct', () => {
    const left = parseIdentityKey({
      email: 'same@example.com',
      issuer: ISSUER,
      subject: 'sub-1',
    });
    const right = parseIdentityKey({
      email: 'same@example.com',
      issuer: ISSUER,
      subject: 'sub-2',
    });
    expect(left.ok && right.ok).toBe(true);
    if (left.ok && right.ok) {
      expect(identityKeyEquals(left.value, right.value)).toBe(false);
    }
  });

  it('keeps the same person when only the email attribute changes', () => {
    const left = parseIdentityKey({
      email: 'old@example.com',
      issuer: `${ISSUER}/`,
      subject: 'sub-1',
      tenant: 'acme',
    });
    const right = parseIdentityKey({
      email: 'new@example.com',
      issuer: ISSUER,
      subject: 'sub-1',
      tenant: 'acme',
    });
    expect(left.ok && right.ok).toBe(true);
    if (left.ok && right.ok) {
      expect(identityKeyEquals(left.value, right.value)).toBe(true);
    }
  });

  it('rejects email-only records', () => {
    const result = parseIdentityKey({ email: 'person@example.com', id: 'user-1' });
    expect(result.ok).toBe(false);
  });

  it('rejects a different issuer with the same subject', () => {
    const left = parseIdentityKey({ issuer: ISSUER, subject: 'sub-1' });
    const right = parseIdentityKey({ issuer: OTHER_ISSUER, subject: 'sub-1' });
    expect(left.ok && right.ok).toBe(true);
    if (left.ok && right.ok) {
      expect(identityKeyEquals(left.value, right.value)).toBe(false);
    }
  });
});
