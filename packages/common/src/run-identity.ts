import {
  contractFail,
  contractOk,
  parseNonEmptyString,
  parseRecord,
  parseStringUnion,
} from './contract-result.js';
import { parseIdentityKey } from './identity-key.js';
import { parseBackendWorkspaceIds } from './workspace-boundary.js';

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

const AUDIENCE_KINDS = ['channel', 'project', 'users'] as const;
const SPONSOR_KINDS = ['member', 'team'] as const;

export function parseRunIdentity(value: unknown): ContractResult<RunIdentity> {
  const record = parseRecord(value, 'Run identity must be an object.');
  if (!record.ok) {
    return record;
  }
  const ids = parseBackendWorkspaceIds(record.value);
  if (!ids.ok) {
    return ids;
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
    backendId: ids.value.backendId,
    executionPrincipal: executionPrincipal.value,
    initiatedBy: initiatedBy.value,
    outputAudience: outputAudience.value,
    workspaceId: ids.value.workspaceId,
  });
}

function parseInitiatedBy(value: unknown): ContractResult<RunInitiator> {
  const record = parseRecord(value, 'initiatedBy is required.');
  if (!record.ok) {
    return record;
  }
  const kind = parseStringUnion(
    record.value.kind,
    ['external', 'human', 'routine'],
    'initiatedBy.kind is required.',
    'initiatedBy.kind is invalid.',
  );
  if (!kind.ok) {
    return kind;
  }
  if (kind.value === 'routine') {
    return parseIdKind(record.value, kind.value, 'initiatedBy.id is required.');
  }
  return parseIdentityKind(record.value, kind.value);
}

function parseExecutionPrincipal(value: unknown): ContractResult<ExecutionPrincipal> {
  const record = parseRecord(value, 'executionPrincipal is required.');
  if (!record.ok) {
    return record;
  }
  const kind = parseStringUnion(
    record.value.kind,
    ['user', 'workload'],
    'executionPrincipal.kind is required.',
    'executionPrincipal.kind is invalid.',
  );
  if (!kind.ok) {
    return kind;
  }
  if (kind.value === 'workload') {
    return parseIdKind(record.value, kind.value, 'executionPrincipal.id is required.');
  }
  return parseIdentityKind(record.value, kind.value);
}

function parseSponsor(value: unknown): ContractResult<RunSponsor> {
  const record = parseRecord(value, 'accountableSponsor is required.');
  if (!record.ok) {
    return record;
  }
  const kind = parseStringUnion(
    record.value.kind,
    SPONSOR_KINDS,
    'accountableSponsor.kind is required.',
    'accountableSponsor.kind is invalid.',
  );
  if (!kind.ok) {
    return kind;
  }
  return parseIdKind(record.value, kind.value, 'accountableSponsor.id is required.');
}

function parseAudience(value: unknown): ContractResult<RunAudience> {
  const record = parseRecord(value, 'outputAudience is required.');
  if (!record.ok) {
    return record;
  }
  const kind = parseStringUnion(
    record.value.kind,
    AUDIENCE_KINDS,
    'outputAudience.kind is required.',
    'outputAudience.kind is invalid.',
  );
  if (!kind.ok) {
    return kind;
  }
  const ids = parseIdList(record.value.ids);
  if (!ids.ok) {
    return ids;
  }
  return contractOk({ ids: ids.value, kind: kind.value });
}

function parseIdKind<T extends string>(
  record: Record<string, unknown>,
  kind: T,
  idReason: string,
): ContractResult<{ id: string; kind: T }> {
  const id = parseNonEmptyString(record.id, idReason);
  if (!id.ok) {
    return id;
  }
  return contractOk({ id: id.value, kind });
}

function parseIdentityKind<T extends string>(
  record: Record<string, unknown>,
  kind: T,
): ContractResult<{ identity: IdentityKey; kind: T }> {
  const identity = parseIdentityKey(record.identity);
  if (!identity.ok) {
    return identity;
  }
  return contractOk({ identity: identity.value, kind });
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
