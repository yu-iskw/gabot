import { describe, expect, it } from 'vitest';

import {
  membershipIsActive,
  parseMembershipStatus,
  parseMembershipStatusOrActive,
  parseWorkspaceRole,
} from './workspace-membership.js';

describe('parseWorkspaceRole', () => {
  it('accepts admin member and auditor', () => {
    expect(parseWorkspaceRole('admin')).toEqual({ ok: true, value: 'admin' });
    expect(parseWorkspaceRole('member')).toEqual({ ok: true, value: 'member' });
    expect(parseWorkspaceRole('auditor')).toEqual({ ok: true, value: 'auditor' });
  });

  it('rejects unknown roles', () => {
    const result = parseWorkspaceRole('owner');
    expect(result.ok).toBe(false);
  });
});

describe('parseMembershipStatus', () => {
  it('defaults missing status to active', () => {
    expect(parseMembershipStatusOrActive(undefined)).toEqual({ ok: true, value: 'active' });
  });

  it('accepts revoked', () => {
    expect(parseMembershipStatus('revoked')).toEqual({ ok: true, value: 'revoked' });
  });
});

describe('membershipIsActive', () => {
  it('is true only for active rows', () => {
    expect(
      membershipIsActive({
        workspaceId: 'ws-gabot',
        userId: 'user-1',
        role: 'member',
        status: 'active',
      }),
    ).toBe(true);
    expect(
      membershipIsActive({
        workspaceId: 'ws-gabot',
        userId: 'user-1',
        role: 'admin',
        status: 'revoked',
      }),
    ).toBe(false);
  });
});
