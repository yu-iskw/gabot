import { cloneAuthority } from '@gabot/common';

import type { RunRecord, RunStatus } from './types.js';
import type { AuthorityEnvelope } from '@gabot/common';

export type DbRun = {
  authority: AuthorityEnvelope | string;
  bot_id: string;
  channel_id: string;
  depth: number;
  error: string | null;
  finished_at: Date | null;
  id: string;
  objective: string;
  owner_user_id: string;
  parent_run_id: string | null;
  project_id: string;
  root_run_id: string;
  started_at: Date | null;
  status: string;
  trigger_type: string;
  workspace_id: string;
};

export function parseEnvelope(value: AuthorityEnvelope | string): AuthorityEnvelope {
  if (typeof value === 'string') {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed === 'object' && parsed !== null && 'allowedTools' in parsed) {
      const tools = (parsed as { allowedTools?: unknown }).allowedTools;
      return {
        allowedTools: Array.isArray(tools) ? tools.filter((item) => typeof item === 'string') : [],
      };
    }
    return { allowedTools: [] };
  }
  return cloneAuthority(value);
}

function toRunStatus(value: string): RunStatus {
  switch (value) {
    case 'queued':
    case 'running':
    case 'succeeded':
    case 'failed':
    case 'cancelled': {
      return value;
    }
    default: {
      return 'failed';
    }
  }
}

export function toRunRecord(row: DbRun): RunRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    channelId: row.channel_id,
    parentRunId: row.parent_run_id,
    rootRunId: row.root_run_id,
    botId: row.bot_id,
    ownerUserId: row.owner_user_id,
    triggerType: row.trigger_type,
    status: toRunStatus(row.status),
    objective: row.objective,
    authority: parseEnvelope(row.authority),
    depth: Number(row.depth),
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    error: row.error,
  };
}
