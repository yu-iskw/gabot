import { describe, expect, it } from 'vitest';

import {
  membershipCoversWorkspace,
  membershipIsActive,
  parseMembershipStatus,
  parseMembershipStatusOrActive,
  parseWorkspaceRole,
  workspaceRoleCanAdminister,
  workspaceRoleCanReadAudit,
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

  it('covers a workspace only for an active row on that workspace', () => {
    const active = {
      workspaceId: 'ws-gabot',
      userId: 'user-1',
      role: 'member' as const,
      status: 'active' as const,
    };
    expect(membershipCoversWorkspace(active, 'ws-gabot')).toBe(true);
    expect(membershipCoversWorkspace(active, 'ws-pay')).toBe(false);
    expect(membershipCoversWorkspace(null, 'ws-gabot')).toBe(false);
    expect(membershipCoversWorkspace({ ...active, status: 'revoked' }, 'ws-gabot')).toBe(false);
  });
});

describe('workspace roles', () => {
  it('lets admin administer and auditor read audit only', () => {
    expect(workspaceRoleCanAdminister('admin')).toBe(true);
    expect(workspaceRoleCanAdminister('member')).toBe(false);
    expect(workspaceRoleCanAdminister('auditor')).toBe(false);
    expect(workspaceRoleCanReadAudit('admin')).toBe(true);
    expect(workspaceRoleCanReadAudit('auditor')).toBe(true);
    expect(workspaceRoleCanReadAudit('member')).toBe(false);
  });
});
