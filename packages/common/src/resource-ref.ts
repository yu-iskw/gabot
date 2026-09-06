import { contractFail, contractOk, parseNonEmptyString, parseRecord } from './contract-result.js';
import { parseHttpOrigin } from './http-origin.js';

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

const BACKEND_REQUIRED = 'Backend id is required.';
const LOCAL_ID_REQUIRED = 'Local resource id is required.';
const TYPE_REQUIRED = 'Resource type is required.';
const WORKSPACE_REQUIRED = 'Workspace id is required.';

export function parseResourceType(value: unknown): ContractResult<ResourceType> {
  const raw = parseNonEmptyString(value, TYPE_REQUIRED);
  if (!raw.ok) {
    return raw;
  }
  if (!isResourceType(raw.value)) {
    return contractFail(`Resource type ${raw.value} is not supported.`);
  }
  return contractOk(raw.value);
}

export function parseScopedResourceRef(value: unknown): ContractResult<ScopedResourceRef> {
  const record = parseRecord(value, 'Resource reference must be an object.');
  if (!record.ok) {
    return record;
  }
  const origin = parseHttpOrigin(record.value.origin);
  if (!origin.ok) {
    return origin;
  }
  const backendId = parseNonEmptyString(record.value.backendId, BACKEND_REQUIRED);
  if (!backendId.ok) {
    return backendId;
  }
  const workspaceId = parseNonEmptyString(record.value.workspaceId, WORKSPACE_REQUIRED);
  if (!workspaceId.ok) {
    return workspaceId;
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
    backendId: backendId.value,
    localId: localId.value,
    origin: origin.value,
    resourceType: resourceType.value,
    workspaceId: workspaceId.value,
  });
}

export function scopedResourceEquals(left: ScopedResourceRef, right: ScopedResourceRef): boolean {
  return scopedResourceKey(left) === scopedResourceKey(right);
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

function isResourceType(value: string): value is ResourceType {
  return RESOURCE_TYPES.some((type) => type === value);
}
