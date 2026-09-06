export type SessionScope = {
  generation: number;
  origin: string;
  principalId: string;
  workspaceId: string | null;
};

export type SessionMe = {
  defaultChannelId: string | null;
  email: string;
  id: string;
  membershipStatus: 'active' | 'revoked' | null;
  name: string;
  role: 'admin' | 'auditor' | 'member' | null;
  workspaceId: string | null;
};

const WORKSPACE_ROLES = new Set(['admin', 'auditor', 'member']);
const MEMBERSHIP_STATUSES = new Set(['active', 'revoked']);

export function sessionQueryKey(scope: SessionScope, ...parts: readonly unknown[]): unknown[] {
  return [scope.origin, scope.workspaceId, scope.principalId, scope.generation, ...parts];
}

export function sessionOrigin(apiBase: string, fallbackOrigin: string): string {
  if (apiBase.startsWith('http://') || apiBase.startsWith('https://')) {
    return new URL(apiBase).origin;
  }
  return fallbackOrigin;
}

export function sessionMembershipLabel(
  me: Pick<SessionMe, 'role' | 'workspaceId'>,
  empty = '',
): string {
  return [me.workspaceId, me.role].filter(Boolean).join(' · ') || empty;
}

export function parseSessionMe(value: unknown): SessionMe {
  if (typeof value !== 'object' || value === null) {
    throw new Error('session me must be an object');
  }
  const record = value as Record<string, unknown>;
  return {
    defaultChannelId: readNullableString(record.defaultChannelId, 'defaultChannelId'),
    email: readRequiredString(record.email, 'email'),
    id: readRequiredString(record.id, 'id'),
    membershipStatus: readNullableUnion(
      record.membershipStatus,
      'membershipStatus',
      MEMBERSHIP_STATUSES,
    ),
    name: readRequiredString(record.name, 'name'),
    role: readNullableUnion(record.role, 'role', WORKSPACE_ROLES),
    workspaceId: readNullableString(record.workspaceId, 'workspaceId'),
  };
}

function readRequiredString(value: unknown, key: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`session me missing ${key}`);
  }
  return value;
}

function readNullableString(value: unknown, key: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new Error(`session me invalid ${key}`);
  }
  return value;
}

function readNullableUnion<T extends string>(
  value: unknown,
  key: string,
  allowed: Set<string>,
): T | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw new Error(`session me invalid ${key}`);
  }
  return value as T;
}
