import { createHash } from 'node:crypto';

import {
  contractFail,
  contractOk,
  parseNonEmptyString,
  parseOptionalNonEmptyString,
  parseRecord,
  parseStringUnion,
} from './contract-result.js';

import type { ContractResult } from './contract-result.js';

export const TASK_STATUSES = [
  'queued',
  'working',
  'completed',
  'failed',
  'cancelled',
  'partial',
  'blocked',
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const DEFAULT_DIAGNOSIS_CRITERIA =
  'Produce a versioned diagnosis artifact with labeled observations and hypotheses.';

export type TaskAdmitRequest = {
  audience: string;
  botId?: string;
  channelId: string;
  idempotencyKey: string;
  objective: string;
  resources: string[];
  successCriteria: string;
};

export type TaskAdmitAccepted = {
  runId: string;
  status: 'queued';
  taskId: string;
};

export type ArtifactSnapshot = {
  audience: string;
  content: string;
  contentRef: string;
  id: string;
  kind: string;
  validationStatus: string;
  version: number;
};

export type TaskSnapshot = {
  artifact: ArtifactSnapshot | null;
  audience: string;
  botId: string;
  channelId: string;
  currentRunId: string | null;
  id: string;
  objective: string;
  status: TaskStatus;
  successCriteria: string;
  updatedAt: string;
  workspaceId: string;
};

export type SequencedRunEvent = {
  createdAt: string;
  payload: Record<string, unknown>;
  runId: string;
  schemaVersion: number;
  sequence: number;
  type: string;
};

export function parseTaskAdmitRequest(value: unknown): ContractResult<TaskAdmitRequest> {
  const record = parseRecord(value, 'Task admit request must be an object.');
  if (!record.ok) {
    return record;
  }
  const objective = parseNonEmptyString(record.value.objective, 'objective is required.');
  if (!objective.ok) {
    return objective;
  }
  const channelId = parseNonEmptyString(record.value.channelId, 'channelId is required.');
  if (!channelId.ok) {
    return channelId;
  }
  const idempotencyKey = parseNonEmptyString(
    record.value.idempotencyKey,
    'idempotencyKey is required.',
  );
  if (!idempotencyKey.ok) {
    return idempotencyKey;
  }
  const successCriteriaRaw = parseOptionalNonEmptyString(
    record.value.successCriteria,
    'successCriteria must be a string.',
  );
  if (!successCriteriaRaw.ok) {
    return successCriteriaRaw;
  }
  const audienceRaw = parseOptionalNonEmptyString(record.value.audience, 'audience must be a string.');
  if (!audienceRaw.ok) {
    return audienceRaw;
  }
  const botId = parseOptionalNonEmptyString(record.value.botId, 'botId must be a string.');
  if (!botId.ok) {
    return botId;
  }
  const resources = parseStringArray(record.value.resources);
  if (!resources.ok) {
    return resources;
  }
  return contractOk({
    objective: objective.value,
    channelId: channelId.value,
    idempotencyKey: idempotencyKey.value,
    successCriteria: successCriteriaRaw.value ?? DEFAULT_DIAGNOSIS_CRITERIA,
    audience: audienceRaw.value ?? 'creator',
    botId: botId.value,
    resources: resources.value,
  });
}

export function parseTaskStatus(value: unknown): ContractResult<TaskStatus> {
  return parseStringUnion(
    value,
    TASK_STATUSES,
    'task status is required.',
    'Invalid task status.',
  );
}

export function digestTaskAdmitRequest(request: TaskAdmitRequest): string {
  const canonical = JSON.stringify({
    audience: request.audience,
    botId: request.botId ?? null,
    channelId: request.channelId,
    objective: request.objective,
    resources: [...request.resources].sort(),
    successCriteria: request.successCriteria,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export function buildDiagnosisArtifactContent(objective: string, modelText: string): string {
  return [
    '## Observations',
    `- Objective: ${objective}`,
    `- Model output: ${modelText || '(empty)'}`,
    '',
    '## Hypotheses',
    '- Fixture diagnosis for durable task reconnect proof.',
  ].join('\n');
}

export function diagnosisArtifactMeetsCriteria(criteria: string, content: string): boolean {
  const requiresDiagnosis =
    /observation/i.test(criteria) || /hypothes/i.test(criteria) || criteria.trim().length === 0;
  if (!requiresDiagnosis) {
    return content.trim().length > 0;
  }
  return /##\s*Observations/i.test(content) && /##\s*Hypotheses/i.test(content);
}

function parseStringArray(value: unknown): ContractResult<string[]> {
  if (value === undefined || value === null) {
    return contractOk([]);
  }
  if (!Array.isArray(value)) {
    return contractFail('resources must be an array of strings.');
  }
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      return contractFail('resources must be an array of strings.');
    }
    out.push(entry.trim());
  }
  return contractOk(out);
}
