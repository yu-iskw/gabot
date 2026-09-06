import { contractFail, contractOk, parseNonEmptyString, parseRecord } from './contract-result.js';
import { parseWorkspaceScope } from './workspace-boundary.js';

import type { ContractResult } from './contract-result.js';

export const RESOURCE_TYPES = [
  'agent',
  'artifact',
  'catalog-entry',
  'channel',
  'connection',
  'event',
  'membership',
  'project',
  'run',
  'workspace',
] as const;

export type ResourceType = (typeof RESOURCE_TYPES)[number];

export type ScopedResourceRef = {
  backendId: string;
  localId: string;
  origin: string;
  resourceType: ResourceType;
  workspaceId: string;
};

const LOCAL_ID_REQUIRED = 'Local resource id is required.';
const TYPE_REQUIRED = 'Resource type is required.';

export function parseResourceType(value: unknown): ContractResult<ResourceType> {
  const raw = parseNonEmptyString(value, TYPE_REQUIRED);
  if (!raw.ok) {
    return raw;
  }
  const match = RESOURCE_TYPES.find((type) => type === raw.value);
  if (match === undefined) {
    return contractFail(`Resource type ${raw.value} is not supported.`);
  }
  return contractOk(match);
}

export function parseScopedResourceRef(value: unknown): ContractResult<ScopedResourceRef> {
  const record = parseRecord(value, 'Resource reference must be an object.');
  if (!record.ok) {
    return record;
  }
  const scope = parseWorkspaceScope(record.value);
  if (!scope.ok) {
    return scope;
  }
  const resourceType = parseResourceType(record.value.resourceType);
  if (!resourceType.ok) {
    return resourceType;
  }
  const localId = parseNonEmptyString(record.value.localId, LOCAL_ID_REQUIRED);
  if (!localId.ok) {
    return localId;
  }
  return contractOk({
    backendId: scope.value.backendId,
    localId: localId.value,
    origin: scope.value.origin,
    resourceType: resourceType.value,
    workspaceId: scope.value.workspaceId,
  });
}

export function scopedResourceEquals(left: ScopedResourceRef, right: ScopedResourceRef): boolean {
  return (
    left.backendId === right.backendId &&
    left.localId === right.localId &&
    left.origin === right.origin &&
    left.resourceType === right.resourceType &&
    left.workspaceId === right.workspaceId
  );
}

export function scopedResourceKey(ref: ScopedResourceRef): string {
  return [
    encodeURIComponent(ref.origin),
    encodeURIComponent(ref.backendId),
    encodeURIComponent(ref.workspaceId),
    encodeURIComponent(ref.resourceType),
    encodeURIComponent(ref.localId),
  ].join('/');
}
