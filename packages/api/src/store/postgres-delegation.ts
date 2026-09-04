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
  const locked = await sql<{ id: string }[]>`
    SELECT id FROM runs WHERE id = ${parent.id} FOR UPDATE
  `;
  if (locked.at(0) === undefined) {
    throw new Error(`Run ${parent.id} not found.`);
  }
  const counts = await sql<{ child_count: string; root_count: string }[]>`
    SELECT
      count(*) FILTER (WHERE parent_run_id = ${parent.id})::text AS child_count,
      count(*) FILTER (WHERE root_run_id = ${parent.rootRunId})::text AS root_count
    FROM runs
  `;
  const budget = assertDelegationBudget({
    depth: parent.depth,
    childCount: Number.parseInt(counts.at(0)?.child_count ?? '0', 10),
    rootRunCount: Number.parseInt(counts.at(0)?.root_count ?? '0', 10),
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
      ${childId}, ${parent.workspaceId}, ${parent.projectId}, ${parent.channelId},
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
      ${delegationId}, ${parent.id}, ${childId}, ${parent.botId}, ${input.toBotId},
      ${input.objective}, ${JSON.stringify(input.requestedCapabilities)}::jsonb,
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
      ${eventId}, ${parent.channelId}, ${childId}, ${'agent.delegation.requested'},
      ${'bot'}, ${parent.botId},
      ${JSON.stringify({
        toBotId: input.toBotId,
        objective: input.objective,
        parentRunId: parent.id,
      })}::jsonb
    )
  `;
  return toRunRecord(row);
}
