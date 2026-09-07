import { describe, expect, it } from 'vitest';

import { createScriptedPeopleAuth } from './scripted-people-auth.js';

const ISSUER = 'https://id.test/gabot';
const AUDIENCE = 'backend-a';

describe('createScriptedPeopleAuth', () => {
  it('mints and verifies a person token', async () => {
    const auth = createScriptedPeopleAuth({
      issuer: ISSUER,
      audience: AUDIENCE,
      secret: 'test-secret',
    });
    const token = auth.mintIdToken({
      subject: 'user-1',
      email: 'same@example.com',
      name: 'Ada',
    });
    const person = await auth.verifyIdToken(token);
    expect(person.identity).toEqual({ issuer: ISSUER, subject: 'user-1' });
    expect(person.email).toBe('same@example.com');
    expect(person.id).toBe('user-1');
  });

  it('rejects a token minted for another audience', async () => {
    const backendA = createScriptedPeopleAuth({
      issuer: ISSUER,
      audience: 'backend-a',
      secret: 'test-secret',
    });
    const backendB = createScriptedPeopleAuth({
      issuer: ISSUER,
      audience: 'backend-b',
      secret: 'test-secret',
    });
    const token = backendB.mintIdToken({
      subject: 'user-1',
      email: 'ada@example.com',
      name: 'Ada',
    });
    await expect(backendA.verifyIdToken(token)).rejects.toThrow('audience');
  });

  it('rejects an expired token', async () => {
    const auth = createScriptedPeopleAuth({
      issuer: ISSUER,
      audience: AUDIENCE,
      secret: 'test-secret',
    });
    const token = auth.mintIdToken({
      subject: 'user-1',
      email: 'ada@example.com',
      name: 'Ada',
      expiresAt: new Date(Date.now() - 1000),
    });
    await expect(auth.verifyIdToken(token)).rejects.toThrow('Expired');
  });

  it('rejects an empty secret', () => {
    expect(() =>
      createScriptedPeopleAuth({ issuer: ISSUER, audience: AUDIENCE, secret: '' }),
    ).toThrow('required');
  });
});
