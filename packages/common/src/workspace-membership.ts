import { contractOk, parseStringUnion } from './contract-result.js';

import type { ContractResult } from './contract-result.js';

export const WORKSPACE_ROLES = ['admin', 'member', 'auditor'] as const;
export const MEMBERSHIP_STATUSES = ['active', 'revoked'] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export type WorkspaceMembership = {
  role: WorkspaceRole;
  status: MembershipStatus;
  userId: string;
  workspaceId: string;
};

export function parseWorkspaceRole(value: unknown): ContractResult<WorkspaceRole> {
  return parseStringUnion(
    value,
    WORKSPACE_ROLES,
    'Workspace role is required.',
    'Workspace role must be admin, member, or auditor.',
  );
}

export function parseMembershipStatus(value: unknown): ContractResult<MembershipStatus> {
  return parseStringUnion(
    value,
    MEMBERSHIP_STATUSES,
    'Membership status is required.',
    'Membership status must be active or revoked.',
  );
}

export function parseMembershipStatusOrActive(value: unknown): ContractResult<MembershipStatus> {
  if (value === undefined || value === null || value === '') {
    return contractOk('active');
  }
  return parseMembershipStatus(value);
}

export function membershipIsActive(row: WorkspaceMembership): boolean {
  switch (row.status) {
    case 'active':
      return true;
    case 'revoked':
      return false;
    default: {
      const exhaustive: never = row.status;
      return exhaustive;
    }
  }
}

export function membershipCoversWorkspace(
  row: WorkspaceMembership | null,
  workspaceId: string,
): boolean {
  return row !== null && membershipIsActive(row) && row.workspaceId === workspaceId;
}

export function workspaceRoleCanAdminister(role: WorkspaceRole): boolean {
  switch (role) {
    case 'admin':
      return true;
    case 'auditor':
    case 'member':
      return false;
    default: {
      const exhaustive: never = role;
      return exhaustive;
    }
  }
}

export function workspaceRoleCanReadAudit(role: WorkspaceRole): boolean {
  switch (role) {
    case 'admin':
    case 'auditor':
      return true;
    case 'member':
      return false;
    default: {
      const exhaustive: never = role;
      return exhaustive;
    }
  }
}

export function wouldLeaveZeroActiveAdmins(
  memberships: readonly WorkspaceMembership[],
  next: Pick<WorkspaceMembership, 'role' | 'status' | 'userId'>,
): boolean {
  const nextKeepsAdmin = isActiveAdmin(next.role, next.status);
  const otherAdmins = memberships.some(
    (row) => row.userId !== next.userId && isActiveAdmin(row.role, row.status),
  );
  return !nextKeepsAdmin && !otherAdmins;
}

function isActiveAdmin(role: WorkspaceRole, status: MembershipStatus): boolean {
  switch (status) {
    case 'active':
      return workspaceRoleCanAdminister(role);
    case 'revoked':
      return false;
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}
