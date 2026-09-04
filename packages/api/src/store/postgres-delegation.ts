import { assertDelegationBudget } from '@gabot/common';

import { toRunRecord, type DbRun } from './postgres-run-map.js';
import { DelegationBudgetError } from './types.js';

import type { DelegatedChildInput, RunRecord } from './types.js';
import type postgres from 'postgres';

type Sql = postgres.Sql;
type TxSql = postgres.TransactionSql;

export async function insertDelegatedChild(
  sql: Sql,
  input: DelegatedChildInput,
): Promise<RunRecord> {
  return sql.begin((tx) => writeDelegatedChild(tx, input));
}

async function writeDelegatedChild(sql: TxSql, input: DelegatedChildInput): Promise<RunRecord> {
  const parent = input.parent;
  const childCount = await countWhere(sql, 'parent_run_id', parent.id);
  const rootRunCount = await countWhere(sql, 'root_run_id', parent.rootRunId);
  const budget = assertDelegationBudget({
    depth: parent.depth,
    childCount,
    rootRunCount,
  });
  if (!budget.ok) {
    throw new DelegationBudgetError(budget.reason);
  }
  const childId = crypto.randomUUID();
  const rows = await sql<DbRun[]>`
    INSERT INTO runs (
      id, workspace_id, project_id, channel_id, parent_run_id, root_run_id,
      bot_id, owner_user_id, trigger_type, status, objective, authority, depth, started_at
    )
    VALUES (
      ${childId}, ${parent.workspaceId}, ${parent.projectId}, ${input.channelId},
      ${parent.id}, ${parent.rootRunId}, ${input.toBotId}, ${parent.ownerUserId},
      ${'delegation'}, ${'queued'}, ${input.objective},
      ${JSON.stringify(input.authority)}::jsonb, ${parent.depth + 1}, ${null}
    )
    RETURNING
      id, workspace_id, project_id, channel_id, parent_run_id, root_run_id, bot_id,
      owner_user_id, trigger_type, status, objective, authority, depth, started_at,
      finished_at, error
  `;
  const row = rows.at(0);
  if (row === undefined) {
    throw new Error('Failed to create delegated run.');
  }
  const delegationId = crypto.randomUUID();
  await sql`
    INSERT INTO delegations (
      id, parent_run_id, child_run_id, from_bot_id, to_bot_id, objective,
      requested_capabilities, authority_envelope
    )
    VALUES (
      ${delegationId}, ${parent.id}, ${childId}, ${input.fromBotId}, ${input.toBotId},
      ${input.objective}, ${input.requestedCapabilities},
      ${JSON.stringify(input.authority)}::jsonb
    )
  `;
  await sql`
    INSERT INTO work_items (kind, key, run_at, payload)
    VALUES (
      ${'run.execute'}, ${childId}, ${new Date()},
      ${JSON.stringify({ runId: childId })}::jsonb
    )
    ON CONFLICT (kind, key) DO NOTHING
  `;
  const eventId = crypto.randomUUID();
  await sql`
    INSERT INTO channel_events (id, channel_id, run_id, type, actor_type, actor_id, payload)
    VALUES (
      ${eventId}, ${input.channelId}, ${childId}, ${'agent.delegation.requested'},
      ${'bot'}, ${input.fromBotId},
      ${JSON.stringify({
        toBotId: input.toBotId,
        objective: input.objective,
        parentRunId: parent.id,
      })}::jsonb
    )
  `;
  return toRunRecord(row);
}

async function countWhere(
  sql: TxSql,
  column: 'parent_run_id' | 'root_run_id',
  value: string,
): Promise<number> {
  const rows =
    column === 'parent_run_id'
      ? await sql<{ n: string }[]>`
          SELECT count(*)::text AS n FROM runs WHERE parent_run_id = ${value}
        `
      : await sql<{ n: string }[]>`
          SELECT count(*)::text AS n FROM runs WHERE root_run_id = ${value}
        `;
  return Number.parseInt(rows.at(0)?.n ?? '0', 10);
}
