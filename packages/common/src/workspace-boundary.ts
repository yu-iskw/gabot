import { contractFail, contractOk, parseNonEmptyString } from './contract-result.js';
import { parseHttpOrigin } from './http-origin.js';

import type { ContractResult } from './contract-result.js';

export const FEDERATION_OPERATIONS = [
  'credentials',
  'data-transfer',
  'delegation',
  'memory',
  'search',
] as const;

export type FederationOperation = (typeof FEDERATION_OPERATIONS)[number];

export type WorkspaceScope = {
  backendId: string;
  origin: string;
  workspaceId: string;
};

export type BackendBinding = {
  backendId: string;
  origin: string;
};

export type BackendWorkspaceIds = {
  backendId: string;
  workspaceId: string;
};

export function parseBackendWorkspaceIds(value: object): ContractResult<BackendWorkspaceIds> {
  const record = value as Record<string, unknown>;
  const backendId = parseNonEmptyString(record.backendId, 'Backend id is required.');
  if (!backendId.ok) {
    return backendId;
  }
  const workspaceId = parseNonEmptyString(record.workspaceId, 'Workspace id is required.');
  if (!workspaceId.ok) {
    return workspaceId;
  }
  return contractOk({ backendId: backendId.value, workspaceId: workspaceId.value });
}

export function parseWorkspaceScope(value: object): ContractResult<WorkspaceScope> {
  const record = value as Record<string, unknown>;
  const origin = parseHttpOrigin(record.origin);
  if (!origin.ok) {
    return origin;
  }
  const ids = parseBackendWorkspaceIds(record);
  if (!ids.ok) {
    return ids;
  }
  return contractOk({
    backendId: ids.value.backendId,
    origin: origin.value,
    workspaceId: ids.value.workspaceId,
  });
}

export function assertBackendOrigin(
  approved: BackendBinding,
  presentedOrigin: string,
  claimedBackendId: string,
): ContractResult<void> {
  const origin = parseHttpOrigin(presentedOrigin);
  if (!origin.ok) {
    return origin;
  }
  const approvedOrigin = parseHttpOrigin(approved.origin);
  if (!approvedOrigin.ok) {
    return approvedOrigin;
  }
  if (origin.value !== approvedOrigin.value) {
    return contractFail('Presented origin does not match the approved backend origin.');
  }
  if (claimedBackendId !== approved.backendId) {
    return contractFail('Backend id does not match the approved origin binding.');
  }
  return contractOk(undefined);
}

export function assertLocalWorkspaceId(
  scope: WorkspaceScope,
  requestedWorkspaceId: string,
): ContractResult<void> {
  if (requestedWorkspaceId !== scope.workspaceId) {
    return contractFail('Foreign workspace id is not accepted on this backend.');
  }
  return contractOk(undefined);
}

export function assertSameWorkspaceScope(
  left: WorkspaceScope,
  right: WorkspaceScope,
): ContractResult<void> {
  if (
    left.origin !== right.origin ||
    left.backendId !== right.backendId ||
    left.workspaceId !== right.workspaceId
  ) {
    return contractFail('Workspace scopes are not the same deployment boundary.');
  }
  return contractOk(undefined);
}

export function assertNoFederation(
  operation: FederationOperation,
  from: WorkspaceScope,
  to: WorkspaceScope,
): ContractResult<void> {
  const same = assertSameWorkspaceScope(from, to);
  if (same.ok) {
    return same;
  }
  return contractFail(`Cross-workspace ${operation} is not allowed.`);
}

export function assertOneWorkspacePerBackend(
  occupied: WorkspaceScope,
  candidate: WorkspaceScope,
): ContractResult<void> {
  if (occupied.backendId === candidate.backendId && occupied.origin !== candidate.origin) {
    return contractFail('Backend id is already bound to another origin.');
  }
  if (occupied.origin === candidate.origin && occupied.workspaceId !== candidate.workspaceId) {
    return contractFail('This backend already serves a different workspace.');
  }
  return contractOk(undefined);
}

export function workspaceScopeFromRef(ref: {
  backendId: string;
  origin: string;
  workspaceId: string;
}): WorkspaceScope {
  return {
    backendId: ref.backendId,
    origin: ref.origin,
    workspaceId: ref.workspaceId,
  };
}
