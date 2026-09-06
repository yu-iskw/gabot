import {
  contractFail,
  contractOk,
  parseNonEmptyString,
  parseOptionalNonEmptyString,
  parseRecord,
  parseStringUnion,
} from './contract-result.js';
import { parseScopedResourceRef } from './resource-ref.js';
import {
  assertBackendOrigin,
  assertSameWorkspaceScope,
  parseBackendWorkspaceIds,
  parseWorkspaceScope,
  workspaceScopeFromRef,
} from './workspace-boundary.js';

import type { ContractResult } from './contract-result.js';
import type { ScopedResourceRef } from './resource-ref.js';
import type { BackendBinding, WorkspaceScope } from './workspace-boundary.js';

export const CONTRACT_ERROR_CODES = [
  'exhausted_budget',
  'incompatible_client',
  'unauthenticated',
  'unauthorized',
  'unavailable_capability',
  'unknown_provider_outcome',
] as const;

export type ContractErrorCode = (typeof CONTRACT_ERROR_CODES)[number];

export type ContractError = {
  code: ContractErrorCode;
  message: string;
};

export type BootstrapDiscovery = {
  apiVersion: string;
  auth: {
    audience?: string;
    issuer?: string;
    type: 'oidc';
  };
  backendId: string;
  workspaceId: string;
};

export type ScopedFeedEvent = {
  cursor: string;
  occurredAt: string;
  ref: ScopedResourceRef;
};

export function contractError(code: ContractErrorCode, message: string): ContractError {
  return { code, message };
}

export function parseBootstrapDiscovery(value: unknown): ContractResult<BootstrapDiscovery> {
  const record = parseRecord(value, 'Bootstrap discovery must be an object.');
  if (!record.ok) {
    return record;
  }
  const apiVersion = parseNonEmptyString(record.value.apiVersion, 'apiVersion is required.');
  if (!apiVersion.ok) {
    return apiVersion;
  }
  const ids = parseBackendWorkspaceIds(record.value);
  if (!ids.ok) {
    return ids;
  }
  const auth = parseOidcAuth(record.value.auth);
  if (!auth.ok) {
    return auth;
  }
  return contractOk({
    apiVersion: apiVersion.value,
    auth: auth.value,
    backendId: ids.value.backendId,
    workspaceId: ids.value.workspaceId,
  });
}

export function bindBootstrapDiscovery(input: {
  approved: BackendBinding;
  discovery: unknown;
  presentedOrigin: string;
}): ContractResult<WorkspaceScope> {
  const discovery = parseBootstrapDiscovery(input.discovery);
  if (!discovery.ok) {
    return discovery;
  }
  const binding = assertBackendOrigin(
    input.approved,
    input.presentedOrigin,
    discovery.value.backendId,
  );
  if (!binding.ok) {
    return binding;
  }
  return parseWorkspaceScope({
    backendId: discovery.value.backendId,
    origin: input.approved.origin,
    workspaceId: discovery.value.workspaceId,
  });
}

export function apiVersionsCompatible(server: string, client: string): boolean {
  return majorVersion(server) === majorVersion(client);
}

export function parseScopedFeedEvent(value: unknown): ContractResult<ScopedFeedEvent> {
  const record = parseRecord(value, 'Feed event must be an object.');
  if (!record.ok) {
    return record;
  }
  const cursor = parseNonEmptyString(record.value.cursor, 'Event cursor is required.');
  if (!cursor.ok) {
    return cursor;
  }
  const occurredAt = parseOccurredAt(record.value.occurredAt);
  if (!occurredAt.ok) {
    return occurredAt;
  }
  const ref = parseScopedResourceRef(record.value.ref);
  if (!ref.ok) {
    return ref;
  }
  return contractOk({
    cursor: cursor.value,
    occurredAt: occurredAt.value,
    ref: ref.value,
  });
}

export function assertEventInScope(
  event: ScopedFeedEvent,
  scope: WorkspaceScope,
): ContractResult<void> {
  const same = assertSameWorkspaceScope(workspaceScopeFromRef(event.ref), scope);
  if (same.ok) {
    return same;
  }
  return contractFail('Event does not belong to this workspace scope.');
}

const AUTH_STRING_REASON = 'Discovery auth strings must be non-empty when present.';

function parseOidcAuth(value: unknown): ContractResult<BootstrapDiscovery['auth']> {
  const record = parseRecord(value, 'Discovery auth is required.');
  if (!record.ok) {
    return record;
  }
  const type = parseStringUnion(
    record.value.type,
    ['oidc'],
    'Discovery auth type is required.',
    'Discovery auth type must be oidc.',
  );
  if (!type.ok) {
    return type;
  }
  const issuer = parseOptionalNonEmptyString(record.value.issuer, AUTH_STRING_REASON);
  if (!issuer.ok) {
    return issuer;
  }
  const audience = parseOptionalNonEmptyString(record.value.audience, AUTH_STRING_REASON);
  if (!audience.ok) {
    return audience;
  }
  return contractOk({
    type: type.value,
    ...(issuer.value === undefined ? {} : { issuer: issuer.value }),
    ...(audience.value === undefined ? {} : { audience: audience.value }),
  });
}

function parseOccurredAt(value: unknown): ContractResult<string> {
  const raw = parseNonEmptyString(value, 'occurredAt is required.');
  if (!raw.ok) {
    return raw;
  }
  if (Number.isNaN(Date.parse(raw.value))) {
    return contractFail('occurredAt is not an ISO-8601 timestamp.');
  }
  return contractOk(raw.value);
}

function majorVersion(version: string): string {
  const match = /^v?(\d+)/u.exec(version.trim());
  return match?.[1] ?? version.trim();
}
