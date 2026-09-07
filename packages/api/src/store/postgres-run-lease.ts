import { toRunRecord, type DbRun } from './postgres-run-map.js';
import { RUN_EXECUTE_KIND, RUN_LEASE_LOST, WORK_LEASE_MS } from './types.js';

import type {
  AcquireRunInput,
  AdmittedRun,
  RenewRunLeaseInput,
  RootRunAdmission,
  RunAcquisition,
  RunLease,
  RunRecord,
  SettleRunInput,
} from './types.js';
import type postgres from 'postgres';

type Sql = postgres.Sql;
type TxSql = postgres.TransactionSql;

type DbWork = {
  claimed_by: string | null;
  finished_at: Date | null;
  lease_until: Date | null;
};

function leaseUntilOf(now: Date): Date {
  return new Date(now.getTime() + WORK_LEASE_MS);
}

function isLiveLease(work: DbWork | undefined, now: Date): boolean {
  return (
    work !== undefined &&
    work.finished_at === null &&
    work.claimed_by !== null &&
    work.lease_until !== null &&
    work.lease_until > now
  );
}

function heldByOther(work: DbWork | undefined, executorId: string, now: Date): boolean {
  return isLiveLease(work, now) && work?.claimed_by !== executorId;
}

export async function insertAdmittedRootRun(
  sql: Sql,
  input: RootRunAdmission,
): Promise<AdmittedRun> {
  return sql.begin((tx) => writeAdmittedRootRun(tx, input));
}

async function writeAdmittedRootRun(sql: TxSql, input: RootRunAdmission): Promise<AdmittedRun> {
  const now = input.now ?? new Date();
  const id = crypto.randomUUID();
  const rows = await sql<DbRun[]>`
    INSERT INTO runs (
      id, workspace_id, project_id, channel_id, parent_run_id, root_run_id,
      bot_id, owner_user_id, trigger_type, status, objective, authority, depth, started_at
    )
    VALUES (
      ${id}, ${input.workspaceId}, ${input.projectId}, ${input.channelId},
      ${null}, ${id}, ${input.botId}, ${input.ownerUserId},
      ${input.triggerType}, ${'queued'}, ${input.message},
      ${JSON.stringify(input.authority)}::jsonb, ${0}, ${null}
    )
    RETURNING
      id, workspace_id, project_id, channel_id, parent_run_id, root_run_id, bot_id,
      owner_user_id, trigger_type, status, objective, authority, depth, started_at,
      finished_at, error
  `;
  const row = rows.at(0);
  if (row === undefined) {
    throw new Error('Failed to admit root run.');
  }

  const messageId = crypto.randomUUID();
  await sql`
    INSERT INTO messages (id, channel_id, role, content, agent_id)
    VALUES (${messageId}, ${input.channelId}, ${'user'}, ${input.message}, ${null})
  `;
  await sql`
    UPDATE channels SET last_message = ${input.message}, last_message_at = now(), updated_at = now()
    WHERE id = ${input.channelId}
  `;

  await sql`
    INSERT INTO channel_events (id, channel_id, run_id, type, actor_type, actor_id, payload)
    VALUES
      (
        ${crypto.randomUUID()}, ${input.channelId}, ${id}, ${'message.user'},
        ${'user'}, ${input.ownerUserId}, ${JSON.stringify({ message: input.message })}::jsonb
      ),
      (
        ${crypto.randomUUID()}, ${input.channelId}, ${id}, ${'run.started'},
        ${'bot'}, ${input.botId}, ${JSON.stringify({ trigger: input.triggerType })}::jsonb
      )
  `;

  await insertClaimedExecuteWork(sql, id, input.executorId, now, true);

  return {
    run: toRunRecord(row),
    lease: { executorId: input.executorId, leaseUntil: leaseUntilOf(now) },
  };
}

export async function acquireRun(sql: Sql, input: AcquireRunInput): Promise<RunAcquisition> {
  return sql.begin((tx) => performAcquireRun(tx, input));
}

async function performAcquireRun(sql: TxSql, input: AcquireRunInput): Promise<RunAcquisition> {
  const now = input.now ?? new Date();
  const runRow = await lockRunRow(sql, input.runId);
  if (runRow === undefined) {
    return { outcome: 'missing' };
  }
  const run = toRunRecord(runRow);
  if (run.status === 'succeeded' || run.status === 'failed' || run.status === 'cancelled') {
    return { outcome: 'terminal', run };
  }

  const work = await lockWorkRow(sql, input.runId);
  if (heldByOther(work, input.executorId, now)) {
    return { outcome: 'busy', run };
  }

  if (run.status === 'queued') {
    return startQueuedRun(sql, input, now, work !== undefined);
  }
  return reapRunningRun(sql, run, now);
}

async function insertClaimedExecuteWork(
  sql: TxSql,
  runId: string,
  executorId: string,
  now: Date,
  onConflictDoNothing: boolean,
): Promise<void> {
  const leaseUntil = leaseUntilOf(now);
  const payload = JSON.stringify({ runId });
  if (onConflictDoNothing) {
    await sql`
      INSERT INTO work_items (kind, key, run_at, payload, claimed_by, lease_until, attempts)
      VALUES (
        ${RUN_EXECUTE_KIND}, ${runId}, ${now}, ${payload}::jsonb,
        ${executorId}, ${leaseUntil}, ${1}
      )
      ON CONFLICT (kind, key) DO NOTHING
    `;
    return;
  }
  await sql`
    INSERT INTO work_items (kind, key, run_at, payload, claimed_by, lease_until, attempts)
    VALUES (
      ${RUN_EXECUTE_KIND}, ${runId}, ${now}, ${payload}::jsonb,
      ${executorId}, ${leaseUntil}, ${1}
    )
  `;
}

async function lockRunRow(sql: TxSql, runId: string): Promise<DbRun | undefined> {
  const rows = await sql<DbRun[]>`
    SELECT id, workspace_id, project_id, channel_id, parent_run_id, root_run_id, bot_id,
           owner_user_id, trigger_type, status, objective, authority, depth, started_at,
           finished_at, error
    FROM runs WHERE id = ${runId} FOR UPDATE
  `;
  return rows.at(0);
}

async function lockWorkRow(sql: TxSql, runId: string): Promise<DbWork | undefined> {
  const rows = await sql<DbWork[]>`
    SELECT claimed_by, lease_until, finished_at
    FROM work_items WHERE kind = ${RUN_EXECUTE_KIND} AND key = ${runId} FOR UPDATE
  `;
  return rows.at(0);
}

async function startQueuedRun(
  sql: TxSql,
  input: AcquireRunInput,
  now: Date,
  hasWorkRow: boolean,
): Promise<RunAcquisition> {
  if (hasWorkRow) {
    await sql`
      UPDATE work_items
      SET claimed_by = ${input.executorId},
          lease_until = ${leaseUntilOf(now)},
          finished_at = ${null},
          attempts = attempts + CASE WHEN claimed_by = ${input.executorId} THEN 0 ELSE 1 END,
          updated_at = now()
      WHERE kind = ${RUN_EXECUTE_KIND} AND key = ${input.runId}
    `;
  } else {
    await insertClaimedExecuteWork(sql, input.runId, input.executorId, now, false);
  }
  const updatedRows = await sql<DbRun[]>`
    UPDATE runs
    SET status = ${'running'}, started_at = COALESCE(started_at, ${now}), updated_at = now()
    WHERE id = ${input.runId} AND status = ${'queued'}
    RETURNING
      id, workspace_id, project_id, channel_id, parent_run_id, root_run_id, bot_id,
      owner_user_id, trigger_type, status, objective, authority, depth, started_at,
      finished_at, error
  `;
  const updatedRow = updatedRows.at(0);
  if (updatedRow === undefined) {
    throw new Error(`Failed to acquire run ${input.runId}.`);
  }
  return {
    outcome: 'started',
    run: toRunRecord(updatedRow),
    lease: { executorId: input.executorId, leaseUntil: leaseUntilOf(now) },
  };
}

async function reapRunningRun(sql: TxSql, run: RunRecord, now: Date): Promise<RunAcquisition> {
  const reapedRows = await sql<DbRun[]>`
    UPDATE runs
    SET status = ${'failed'}, error = ${RUN_LEASE_LOST}, finished_at = ${now}, updated_at = now()
    WHERE id = ${run.id} AND status = ${'running'}
    RETURNING
      id, workspace_id, project_id, channel_id, parent_run_id, root_run_id, bot_id,
      owner_user_id, trigger_type, status, objective, authority, depth, started_at,
      finished_at, error
  `;
  const reapedRow = reapedRows.at(0);
  if (reapedRow === undefined) {
    throw new Error(`Failed to reap run ${run.id}.`);
  }
  await sql`
    UPDATE work_items
    SET finished_at = ${now}, last_error = ${RUN_LEASE_LOST}, updated_at = now()
    WHERE kind = ${RUN_EXECUTE_KIND} AND key = ${run.id}
  `;
  const reapedRun = toRunRecord(reapedRow);
  const eventId = crypto.randomUUID();
  await sql`
    INSERT INTO channel_events (id, channel_id, run_id, type, actor_type, actor_id, payload)
    VALUES (
      ${eventId}, ${reapedRun.channelId}, ${reapedRun.id},
      ${reapedRun.parentRunId ? 'agent.delegation.failed' : 'run.failed'},
      ${'bot'}, ${reapedRun.botId}, ${JSON.stringify({ error: RUN_LEASE_LOST })}::jsonb
    )
  `;
  return { outcome: 'lost', run: reapedRun };
}

export async function renewRunLease(sql: Sql, input: RenewRunLeaseInput): Promise<RunLease | null> {
  const now = input.now ?? new Date();
  const rows = await sql<{ key: string }[]>`
    UPDATE work_items w
    SET lease_until = ${leaseUntilOf(now)}, updated_at = now()
    FROM runs r
    WHERE w.kind = ${RUN_EXECUTE_KIND} AND w.key = ${input.runId}
      AND w.claimed_by = ${input.executorId}
      AND w.finished_at IS NULL
      AND r.id = w.key AND r.status = ${'running'}
    RETURNING w.key
  `;
  if (rows.at(0) === undefined) {
    return null;
  }
  return { executorId: input.executorId, leaseUntil: leaseUntilOf(now) };
}

export async function settleRun(sql: Sql, input: SettleRunInput): Promise<RunRecord | null> {
  return sql.begin((tx) => performSettleRun(tx, input));
}

async function performSettleRun(sql: TxSql, input: SettleRunInput): Promise<RunRecord | null> {
  const now = input.now ?? new Date();
  const runRow = await lockRunRow(sql, input.runId);
  if (runRow === undefined || runRow.status !== 'running') {
    return null;
  }

  const work = await lockWorkRow(sql, input.runId);
  if (work && (work.claimed_by !== input.executorId || work.finished_at !== null)) {
    return null;
  }

  const updatedRows = await sql<DbRun[]>`
    UPDATE runs
    SET status = ${input.status}, error = ${input.error ?? null}, finished_at = ${now}, updated_at = now()
    WHERE id = ${input.runId} AND status = ${'running'}
    RETURNING
      id, workspace_id, project_id, channel_id, parent_run_id, root_run_id, bot_id,
      owner_user_id, trigger_type, status, objective, authority, depth, started_at,
      finished_at, error
  `;
  const updatedRow = updatedRows.at(0);
  if (updatedRow === undefined) {
    return null;
  }
  if (work) {
    await sql`
      UPDATE work_items
      SET finished_at = ${now}, last_error = ${input.error ?? null}, updated_at = now()
      WHERE kind = ${RUN_EXECUTE_KIND} AND key = ${input.runId}
    `;
  }
  return toRunRecord(updatedRow);
}
