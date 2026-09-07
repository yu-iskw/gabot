import {
  contractFail,
  contractOk,
  parseNonEmptyString,
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
  const issuer = parsePresentAuthString(record.value.issuer);
  if (!issuer.ok) {
    return issuer;
  }
  const audience = parsePresentAuthString(record.value.audience);
  if (!audience.ok) {
    return audience;
  }
  return contractOk({
    type: type.value,
    ...(issuer.value === undefined ? {} : { issuer: issuer.value }),
    ...(audience.value === undefined ? {} : { audience: audience.value }),
  });
}

function parsePresentAuthString(value: unknown): ContractResult<string | undefined> {
  if (value === undefined || value === null) {
    return contractOk(undefined);
  }
  return parseNonEmptyString(value, AUTH_STRING_REASON);
}

function parseOccurredAt(value: unknown): ContractResult<string> {
  const raw = parseNonEmptyString(value, 'occurredAt is required.');
  if (!raw.ok) {
    return raw;
  }
  if (!isIso8601Instant(raw.value)) {
    return contractFail('occurredAt is not an ISO-8601 timestamp.');
  }
  return contractOk(raw.value);
}

function isIso8601Instant(value: string): boolean {
  const separator = value.indexOf('T');
  if (separator !== 10) {
    return false;
  }
  const date = parseIsoDate(value.slice(0, 10));
  if (date === undefined) {
    return false;
  }
  return parseIsoTimeAndOffset(value.slice(11));
}

function parseIsoDate(value: string): { day: number; month: number; year: number } | undefined {
  if (value.length !== 10 || value[4] !== '-' || value[7] !== '-') {
    return undefined;
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return undefined;
  }
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return undefined;
  }
  return { day, month, year };
}

function parseIsoTimeAndOffset(value: string): boolean {
  const offset = isoOffsetSuffix(value);
  if (offset === undefined) {
    return false;
  }
  return parseIsoClock(value.slice(0, value.length - offset.length));
}

function isoOffsetSuffix(value: string): string | undefined {
  if (value.endsWith('Z')) {
    return 'Z';
  }
  if (value.length < 6) {
    return undefined;
  }
  const suffix = value.slice(-6);
  const sign = suffix[0];
  if ((sign !== '+' && sign !== '-') || suffix[3] !== ':') {
    return undefined;
  }
  const hours = Number(suffix.slice(1, 3));
  const minutes = Number(suffix.slice(4, 6));
  if (!Number.isInteger(hours) || hours > 23 || !Number.isInteger(minutes) || minutes > 59) {
    return undefined;
  }
  return suffix;
}

function parseIsoClock(value: string): boolean {
  if (value.length < 8 || value[2] !== ':' || value[5] !== ':') {
    return false;
  }
  const hour = Number(value.slice(0, 2));
  const minute = Number(value.slice(3, 5));
  const secondChunk = value.slice(6);
  const fractionAt = secondChunk.indexOf('.');
  const secondText = fractionAt === -1 ? secondChunk : secondChunk.slice(0, fractionAt);
  const fraction = fractionAt === -1 ? '' : secondChunk.slice(fractionAt + 1);
  return (
    isIsoHms(hour, minute, Number(secondText), secondText) && isIsoFraction(fractionAt, fraction)
  );
}

function isIsoHms(hour: number, minute: number, second: number, secondText: string): boolean {
  if (secondText.length !== 2 || !Number.isInteger(hour) || !Number.isInteger(minute)) {
    return false;
  }
  return Number.isInteger(second) && hour <= 23 && minute <= 59 && second <= 60;
}

function isIsoFraction(fractionAt: number, fraction: string): boolean {
  return fractionAt === -1 || isShortDigitString(fraction);
}

function isShortDigitString(value: string): boolean {
  if (value.length === 0 || value.length > 9) {
    return false;
  }
  for (const character of value) {
    if (character < '0' || character > '9') {
      return false;
    }
  }
  return true;
}

function majorVersion(version: string): string {
  const match = /^v?(\d+)/u.exec(version.trim());
  return match?.[1] ?? version.trim();
}
