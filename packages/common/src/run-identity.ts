import { contractFail, contractOk, parseNonEmptyString, parseRecord } from './contract-result.js';
import { parseIdentityKey } from './identity-key.js';

import type { ContractResult } from './contract-result.js';
import type { IdentityKey } from './identity-key.js';

export type AudienceKind = 'channel' | 'project' | 'users';

export type SponsorKind = 'member' | 'team';

export type RunInitiator =
  { id: string; kind: 'routine' } | { identity: IdentityKey; kind: 'external' | 'human' };

export type ExecutionPrincipal =
  { id: string; kind: 'workload' } | { identity: IdentityKey; kind: 'user' };

export type RunSponsor = {
  id: string;
  kind: SponsorKind;
};

export type RunAudience = {
  ids: readonly string[];
  kind: AudienceKind;
};

export type RunIdentity = {
  accountableSponsor: RunSponsor;
  backendId: string;
  executionPrincipal: ExecutionPrincipal;
  initiatedBy: RunInitiator;
  outputAudience: RunAudience;
  workspaceId: string;
};

const AUDIENCE_KIND_REQUIRED = 'outputAudience.kind is required.';
const SPONSOR_KIND_REQUIRED = 'accountableSponsor.kind is required.';

export function parseRunIdentity(value: unknown): ContractResult<RunIdentity> {
  const record = parseRecord(value, 'Run identity must be an object.');
  if (!record.ok) {
    return record;
  }
  const backendId = parseNonEmptyString(record.value.backendId, 'Backend id is required.');
  if (!backendId.ok) {
    return backendId;
  }
  const workspaceId = parseNonEmptyString(record.value.workspaceId, 'Workspace id is required.');
  if (!workspaceId.ok) {
    return workspaceId;
  }
  const initiatedBy = parseInitiatedBy(record.value.initiatedBy);
  if (!initiatedBy.ok) {
    return initiatedBy;
  }
  const executionPrincipal = parseExecutionPrincipal(record.value.executionPrincipal);
  if (!executionPrincipal.ok) {
    return executionPrincipal;
  }
  const accountableSponsor = parseSponsor(record.value.accountableSponsor);
  if (!accountableSponsor.ok) {
    return accountableSponsor;
  }
  const outputAudience = parseAudience(record.value.outputAudience);
  if (!outputAudience.ok) {
    return outputAudience;
  }
  return contractOk({
    accountableSponsor: accountableSponsor.value,
    backendId: backendId.value,
    executionPrincipal: executionPrincipal.value,
    initiatedBy: initiatedBy.value,
    outputAudience: outputAudience.value,
    workspaceId: workspaceId.value,
  });
}

function parseInitiatedBy(value: unknown): ContractResult<RunInitiator> {
  const record = parseRecord(value, 'initiatedBy is required.');
  if (!record.ok) {
    return record;
  }
  const kind = parseNonEmptyString(record.value.kind, 'initiatedBy.kind is required.');
  if (!kind.ok) {
    return kind;
  }
  if (kind.value === 'routine') {
    const id = parseNonEmptyString(record.value.id, 'initiatedBy.id is required.');
    if (!id.ok) {
      return id;
    }
    return contractOk({ id: id.value, kind: 'routine' });
  }
  if (kind.value === 'human' || kind.value === 'external') {
    const identity = parseIdentityKey(record.value.identity);
    if (!identity.ok) {
      return identity;
    }
    return contractOk({ identity: identity.value, kind: kind.value });
  }
  return contractFail('initiatedBy.kind is invalid.');
}

function parseExecutionPrincipal(value: unknown): ContractResult<ExecutionPrincipal> {
  const record = parseRecord(value, 'executionPrincipal is required.');
  if (!record.ok) {
    return record;
  }
  const kind = parseNonEmptyString(record.value.kind, 'executionPrincipal.kind is required.');
  if (!kind.ok) {
    return kind;
  }
  if (kind.value === 'workload') {
    const id = parseNonEmptyString(record.value.id, 'executionPrincipal.id is required.');
    if (!id.ok) {
      return id;
    }
    return contractOk({ id: id.value, kind: 'workload' });
  }
  if (kind.value === 'user') {
    const identity = parseIdentityKey(record.value.identity);
    if (!identity.ok) {
      return identity;
    }
    return contractOk({ identity: identity.value, kind: 'user' });
  }
  return contractFail('executionPrincipal.kind is invalid.');
}

function parseSponsor(value: unknown): ContractResult<RunSponsor> {
  const record = parseRecord(value, 'accountableSponsor is required.');
  if (!record.ok) {
    return record;
  }
  const kind = parseNonEmptyString(record.value.kind, SPONSOR_KIND_REQUIRED);
  if (!kind.ok) {
    return kind;
  }
  if (kind.value !== 'member' && kind.value !== 'team') {
    return contractFail('accountableSponsor.kind is invalid.');
  }
  const id = parseNonEmptyString(record.value.id, 'accountableSponsor.id is required.');
  if (!id.ok) {
    return id;
  }
  return contractOk({ id: id.value, kind: kind.value });
}

function parseAudience(value: unknown): ContractResult<RunAudience> {
  const record = parseRecord(value, 'outputAudience is required.');
  if (!record.ok) {
    return record;
  }
  const kind = parseNonEmptyString(record.value.kind, AUDIENCE_KIND_REQUIRED);
  if (!kind.ok) {
    return kind;
  }
  if (kind.value !== 'channel' && kind.value !== 'project' && kind.value !== 'users') {
    return contractFail('outputAudience.kind is invalid.');
  }
  const ids = parseIdList(record.value.ids);
  if (!ids.ok) {
    return ids;
  }
  return contractOk({ ids: ids.value, kind: kind.value });
}

function parseIdList(value: unknown): ContractResult<readonly string[]> {
  if (!Array.isArray(value)) {
    return contractFail('outputAudience.ids must be an array.');
  }
  const ids: string[] = [];
  for (const item of value) {
    const id = parseNonEmptyString(item, 'outputAudience.ids must contain strings.');
    if (!id.ok) {
      return id;
    }
    ids.push(id.value);
  }
  if (ids.length === 0) {
    return contractFail('outputAudience.ids must not be empty.');
  }
  return contractOk(ids);
}
