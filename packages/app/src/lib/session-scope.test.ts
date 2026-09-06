import { describe, expect, it } from 'vitest';

import {
  parseSessionMe,
  sessionMembershipLabel,
  sessionOrigin,
  sessionQueryKey,
} from './session-scope.js';

import type { SessionScope } from './session-scope.js';

const left: SessionScope = {
  generation: 1,
  origin: 'https://backend-a.example',
  principalId: 'user-1',
  workspaceId: 'ws-gabot',
};

const right: SessionScope = {
  ...left,
  origin: 'https://backend-b.example',
};

describe('sessionQueryKey', () => {
  it('keeps colliding local resource ids distinct across origins', () => {
    expect(sessionQueryKey(left, 'messages', 'ch-general')).not.toEqual(
      sessionQueryKey(right, 'messages', 'ch-general'),
    );
  });

  it('changes when workspace or generation differs', () => {
    expect(sessionQueryKey(left, 'channels')).toEqual(sessionQueryKey(left, 'channels'));
    expect(sessionQueryKey(left, 'channels')).not.toEqual(
      sessionQueryKey({ ...left, workspaceId: 'ws-other' }, 'channels'),
    );
    expect(sessionQueryKey(left, 'channels')).not.toEqual(
      sessionQueryKey({ ...left, generation: 2 }, 'channels'),
    );
    expect(sessionQueryKey(left, 'channels')).not.toEqual(
      sessionQueryKey({ ...left, workspaceId: null }, 'channels'),
    );
  });
});

describe('sessionOrigin', () => {
  it('uses the API origin when the base is absolute', () => {
    expect(sessionOrigin('https://api.example/v1', 'https://app.example')).toBe(
      'https://api.example',
    );
  });

  it('falls back for relative or empty API bases', () => {
    expect(sessionOrigin('', 'https://app.example')).toBe('https://app.example');
    expect(sessionOrigin('/api', 'https://app.example')).toBe('https://app.example');
  });
});

describe('sessionMembershipLabel', () => {
  it('joins workspace and role, or uses the empty fallback', () => {
    expect(sessionMembershipLabel({ workspaceId: 'ws-gabot', role: 'admin' })).toBe(
      'ws-gabot · admin',
    );
    expect(
      sessionMembershipLabel({ workspaceId: null, role: null }, 'No workspace membership'),
    ).toBe('No workspace membership');
  });
});

describe('parseSessionMe', () => {
  it('reads workspace membership fields', () => {
    expect(
      parseSessionMe({
        defaultChannelId: 'ch-gabot-general',
        email: 'admin@example.com',
        id: 'user-1',
        membershipStatus: 'active',
        name: 'Admin',
        role: 'admin',
        workspaceId: 'ws-gabot',
      }),
    ).toEqual({
      defaultChannelId: 'ch-gabot-general',
      email: 'admin@example.com',
      id: 'user-1',
      membershipStatus: 'active',
      name: 'Admin',
      role: 'admin',
      workspaceId: 'ws-gabot',
    });
  });

  it('allows a signed-in user without membership', () => {
    expect(
      parseSessionMe({
        email: 'guest@example.com',
        id: 'user-9',
        name: 'Guest',
        role: null,
        workspaceId: null,
      }),
    ).toMatchObject({
      defaultChannelId: null,
      membershipStatus: null,
      role: null,
      workspaceId: null,
    });
  });

  it('rejects an invalid role', () => {
    expect(() =>
      parseSessionMe({
        email: 'admin@example.com',
        id: 'user-1',
        name: 'Admin',
        role: 'owner',
      }),
    ).toThrow(/invalid role/);
  });
});
