import { describe, expect, it } from 'vitest';

import { personFromIdTokenClaims } from './id-token-claims.js';

const ISSUER = 'https://id.test/gabot';
const AUDIENCE = 'backend-a';

describe('personFromIdTokenClaims', () => {
  it('maps issuer subject and email attributes', () => {
    const person = personFromIdTokenClaims(
      {
        iss: ISSUER,
        aud: AUDIENCE,
        sub: 'user-1',
        email: 'same@example.com',
        name: 'Ada',
        exp: Math.floor(Date.now() / 1000) + 60,
      },
      { issuer: ISSUER, audience: AUDIENCE },
    );
    expect(person).toEqual({
      id: 'user-1',
      email: 'same@example.com',
      name: 'Ada',
      identity: { issuer: ISSUER, subject: 'user-1' },
    });
  });

  it('rejects a token for another audience', () => {
    expect(() =>
      personFromIdTokenClaims(
        {
          iss: ISSUER,
          aud: 'backend-b',
          sub: 'user-1',
          email: 'ada@example.com',
          exp: Math.floor(Date.now() / 1000) + 60,
        },
        { issuer: ISSUER, audience: AUDIENCE },
      ),
    ).toThrow('audience');
  });

  it('rejects a token for another issuer', () => {
    expect(() =>
      personFromIdTokenClaims(
        {
          iss: 'https://id.other.test/gabot',
          aud: AUDIENCE,
          sub: 'user-1',
          email: 'ada@example.com',
          exp: Math.floor(Date.now() / 1000) + 60,
        },
        { issuer: ISSUER, audience: AUDIENCE },
      ),
    ).toThrow('issuer');
  });

  it('rejects an expired token', () => {
    expect(() =>
      personFromIdTokenClaims(
        {
          iss: ISSUER,
          aud: AUDIENCE,
          sub: 'user-1',
          email: 'ada@example.com',
          exp: Math.floor(Date.now() / 1000) - 10,
        },
        { issuer: ISSUER, audience: AUDIENCE },
      ),
    ).toThrow('Expired');
  });
});
