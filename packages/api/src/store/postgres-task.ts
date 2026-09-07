import { asStringArray } from '@gabot/common';

import { toRunRecord, type DbRun } from './postgres-run-map.js';
import { RUN_EXECUTE_KIND, TaskIdempotencyConflictError } from './types.js';

import type {
  AdmittedTask,
  ArtifactRecord,
  SequencedRunEventRecord,
  TaskAdmissionInput,
  TaskRecord,
  TaskSnapshotRecord,
  TaskStatus,
} from './types.js';
import type postgres from 'postgres';

type Sql = postgres.Sql;
type TxSql = postgres.TransactionSql;
type Queryable = Sql | TxSql;

type DbTask = {
  audience: string;
  bot_id: string;
  channel_id: string;
  created_at: Date;
  created_by: string;
  current_artifact_id: string | null;
  current_run_id: string | null;
  id: string;
  idempotency_key: string;
  objective: string;
  project_id: string;
  request_digest: string;
  resource_scope: unknown;
  status: string;
  success_criteria: string;
  updated_at: Date;
  workspace_id: string;
};

type DbArtifact = {
  audience: string;
  classification: string;
  content: string;
  content_ref: string;
  created_at: Date;
  id: string;
  kind: string;
  provenance: unknown;
  run_id: string;
  task_id: string;
  validation_status: string;
  version: number;
};

type DbRunEvent = {
  created_at: Date;
  payload: unknown;
  run_id: string;
  schema_version: number;
  sequence: string | number;
  type: string;
};

export async function insertAdmittedTask(sql: Sql, input: TaskAdmissionInput): Promise<AdmittedTask> {
  return sql.begin((tx) => writeAdmittedTask(tx, input));
}

async function writeAdmittedTask(sql: TxSql, input: TaskAdmissionInput): Promise<AdmittedTask> {
  const now = input.now ?? new Date();
  const existing = await sql<DbTask[]>`
    SELECT *
    FROM tasks
    WHERE created_by = ${input.ownerUserId}
      AND workspace_id = ${input.workspaceId}
      AND idempotency_key = ${input.idempotencyKey}
    FOR UPDATE
  `;
  const prior = existing.at(0);
  if (prior) {
    if (prior.request_digest !== input.requestDigest) {
      throw new TaskIdempotencyConflictError();
    }
    if (!prior.current_run_id) {
      throw new Error('Admitted task is missing its run.');
    }
    const runRows = await sql<DbRun[]>`
      SELECT id, workspace_id, project_id, channel_id, parent_run_id, root_run_id, bot_id,
             owner_user_id, trigger_type, status, objective, authority, depth, started_at,
             finished_at, error, task_id
      FROM runs WHERE id = ${prior.current_run_id}
    `;
    const run = runRows.at(0);
    if (!run) {
      throw new Error('Admitted task is missing its run.');
    }
    return { created: false, task: toTaskRecord(prior), run: toRunRecord(run) };
  }

  const taskId = crypto.randomUUID();
  const runId = crypto.randomUUID();
  await sql`
    INSERT INTO tasks (
      id, workspace_id, project_id, channel_id, created_by, bot_id, objective, audience,
      success_criteria, resource_scope, status, current_run_id, current_artifact_id,
      idempotency_key, request_digest, created_at, updated_at
    )
    VALUES (
      ${taskId}, ${input.workspaceId}, ${input.projectId}, ${input.channelId},
      ${input.ownerUserId}, ${input.botId}, ${input.objective}, ${input.audience},
      ${input.successCriteria}, ${JSON.stringify(input.resourceScope)}::jsonb, ${'queued'},
      ${runId}, ${null}, ${input.idempotencyKey}, ${input.requestDigest}, ${now}, ${now}
    )
  `;
  const runRows = await sql<DbRun[]>`
    INSERT INTO runs (
      id, workspace_id, project_id, channel_id, parent_run_id, root_run_id,
      bot_id, owner_user_id, trigger_type, status, objective, authority, depth, started_at, task_id
    )
    VALUES (
      ${runId}, ${input.workspaceId}, ${input.projectId}, ${input.channelId},
      ${null}, ${runId}, ${input.botId}, ${input.ownerUserId},
      ${'interactive'}, ${'queued'}, ${input.objective},
      ${JSON.stringify(input.authority)}::jsonb, ${0}, ${null}, ${taskId}
    )
    RETURNING
      id, workspace_id, project_id, channel_id, parent_run_id, root_run_id, bot_id,
      owner_user_id, trigger_type, status, objective, authority, depth, started_at,
      finished_at, error, task_id
  `;
  const run = runRows.at(0);
  if (!run) {
    throw new Error('Failed to admit task run.');
  }
  await sql`
    INSERT INTO messages (id, channel_id, role, content, agent_id)
    VALUES (${crypto.randomUUID()}, ${input.channelId}, ${'user'}, ${input.objective}, ${null})
  `;
  await sql`
    UPDATE channels SET last_message = ${input.objective}, last_message_at = now(), updated_at = now()
    WHERE id = ${input.channelId}
  `;
  await sql`
    INSERT INTO work_items (kind, key, run_at, payload)
    VALUES (
      ${RUN_EXECUTE_KIND}, ${runId}, ${now},
      ${JSON.stringify({ runId, taskId })}::jsonb
    )
    ON CONFLICT (kind, key) DO NOTHING
  `;
  await sql`
    INSERT INTO run_events (run_id, sequence, type, schema_version, payload, created_at)
    VALUES (
      ${runId}, ${1}, ${'task.admitted'}, ${1},
      ${JSON.stringify({ taskId })}::jsonb, ${now}
    )
  `;
  await sql`
    INSERT INTO outbox (id, kind, payload)
    VALUES (
      ${crypto.randomUUID()}, ${'task.admitted'},
      ${JSON.stringify({ taskId, runId })}::jsonb
    )
  `;
  const taskRows = await sql<DbTask[]>`SELECT * FROM tasks WHERE id = ${taskId}`;
  const task = taskRows.at(0);
  if (!task) {
    throw new Error('Failed to load admitted task.');
  }
  return { created: true, task: toTaskRecord(task), run: toRunRecord(run) };
}

export async function selectTask(sql: Sql, taskId: string): Promise<TaskRecord | null> {
  const rows = await sql<DbTask[]>`SELECT * FROM tasks WHERE id = ${taskId}`;
  const row = rows.at(0);
  return row ? toTaskRecord(row) : null;
}

export async function selectTaskSnapshot(
  sql: Sql,
  taskId: string,
): Promise<TaskSnapshotRecord | null> {
  const task = await selectTask(sql, taskId);
  if (!task) {
    return null;
  }
  if (!task.currentArtifactId) {
    return { task, artifact: null };
  }
  const rows = await sql<DbArtifact[]>`SELECT * FROM artifacts WHERE id = ${task.currentArtifactId}`;
  const row = rows.at(0);
  return { task, artifact: row ? toArtifactRecord(row) : null };
}

export async function selectTasks(
  sql: Sql,
  workspaceId: string,
  limit: number,
): Promise<TaskRecord[]> {
  const rows = await sql<DbTask[]>`
    SELECT * FROM tasks
    WHERE workspace_id = ${workspaceId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows.map(toTaskRecord);
}

export async function selectRunEvents(
  sql: Sql,
  runId: string,
  afterSequence: number,
): Promise<SequencedRunEventRecord[]> {
  const rows = await sql<DbRunEvent[]>`
    SELECT * FROM run_events
    WHERE run_id = ${runId} AND sequence > ${afterSequence}
    ORDER BY sequence ASC
  `;
  return rows.map(toRunEventRecord);
}

export async function insertRunEvent(
  sql: Queryable,
  input: { payload?: Record<string, unknown>; runId: string; type: string },
): Promise<SequencedRunEventRecord> {
  const rows = await sql<DbRunEvent[]>`
    WITH next AS (
      SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence
      FROM run_events WHERE run_id = ${input.runId}
    )
    INSERT INTO run_events (run_id, sequence, type, schema_version, payload)
    SELECT ${input.runId}, next.sequence, ${input.type}, ${1},
           ${JSON.stringify(input.payload ?? {})}::jsonb
    FROM next
    RETURNING *
  `;
  const row = rows.at(0);
  if (!row) {
    throw new Error('Failed to append run event.');
  }
  return toRunEventRecord(row);
}

export async function updateTaskWorking(
  sql: Sql,
  taskId: string,
  runId: string,
): Promise<TaskRecord | null> {
  const rows = await sql<DbTask[]>`
    UPDATE tasks
    SET status = ${'working'}, current_run_id = ${runId}, updated_at = now()
    WHERE id = ${taskId}
    RETURNING *
  `;
  const row = rows.at(0);
  if (!row) {
    return null;
  }
  await insertRunEvent(sql, { runId, type: 'task.working', payload: { taskId } });
  return toTaskRecord(row);
}

export async function completeTaskAttemptTx(
  sql: Sql,
  input: {
    artifactContent: string;
    artifactKind?: string;
    contractMet: boolean;
    runId: string;
    taskId: string;
  },
): Promise<TaskSnapshotRecord | null> {
  return sql.begin(async (tx) => {
    const taskRows = await tx<DbTask[]>`SELECT * FROM tasks WHERE id = ${input.taskId} FOR UPDATE`;
    const taskRow = taskRows.at(0);
    if (!taskRow) {
      return null;
    }
    const versionRows = await tx<{ next: string | number }[]>`
      SELECT COALESCE(MAX(version), 0) + 1 AS next FROM artifacts WHERE task_id = ${input.taskId}
    `;
    const version = Number(versionRows.at(0)?.next ?? 1);
    const artifactId = crypto.randomUUID();
    const status: TaskStatus = input.contractMet ? 'completed' : 'partial';
    const artifactRows = await tx<DbArtifact[]>`
      INSERT INTO artifacts (
        id, task_id, run_id, version, kind, content, content_ref, provenance,
        classification, audience, validation_status
      )
      VALUES (
        ${artifactId}, ${input.taskId}, ${input.runId}, ${version},
        ${input.artifactKind ?? 'diagnosis'}, ${input.artifactContent},
        ${`postgres://artifacts/${artifactId}`}, ${JSON.stringify({ runId: input.runId })}::jsonb,
        ${'internal'}, ${taskRow.audience}, ${input.contractMet ? 'accepted' : 'unchecked'}
      )
      RETURNING *
    `;
    const artifact = artifactRows.at(0);
    if (!artifact) {
      throw new Error('Failed to persist artifact.');
    }
    const updated = await tx<DbTask[]>`
      UPDATE tasks
      SET status = ${status},
          current_artifact_id = ${artifactId},
          updated_at = now()
      WHERE id = ${input.taskId}
      RETURNING *
    `;
    const task = updated.at(0);
    if (!task) {
      throw new Error('Failed to update task.');
    }
    await insertRunEvent(tx, {
      runId: input.runId,
      type: input.contractMet ? 'task.completed' : 'task.partial',
      payload: { taskId: input.taskId, artifactId, version },
    });
    return { task: toTaskRecord(task), artifact: toArtifactRecord(artifact) };
  });
}

export async function cancelTaskTx(
  sql: Sql,
  taskId: string,
  runId: string,
): Promise<TaskRecord | null> {
  return sql.begin(async (tx) => {
    const taskRows = await tx<DbTask[]>`SELECT * FROM tasks WHERE id = ${taskId} FOR UPDATE`;
    const taskRow = taskRows.at(0);
    if (!taskRow) {
      return null;
    }
    if (taskRow.status === 'completed' || taskRow.status === 'cancelled') {
      return toTaskRecord(taskRow);
    }
    await tx`
      UPDATE runs
      SET status = ${'cancelled'}, finished_at = now(), updated_at = now()
      WHERE id = ${runId} AND status IN (${'queued'}, ${'running'})
    `;
    await tx`
      UPDATE work_items
      SET finished_at = now(), updated_at = now()
      WHERE kind = ${RUN_EXECUTE_KIND} AND key = ${runId} AND finished_at IS NULL
    `;
    const updated = await tx<DbTask[]>`
      UPDATE tasks SET status = ${'cancelled'}, updated_at = now()
      WHERE id = ${taskId}
      RETURNING *
    `;
    const task = updated.at(0);
    if (!task) {
      return null;
    }
    await insertRunEvent(tx, { runId, type: 'task.cancelled', payload: { taskId } });
    return toTaskRecord(task);
  });
}

function toTaskRecord(row: DbTask): TaskRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    channelId: row.channel_id,
    createdBy: row.created_by,
    botId: row.bot_id,
    objective: row.objective,
    audience: row.audience,
    successCriteria: row.success_criteria,
    resourceScope: asStringArray(row.resource_scope),
    status: row.status as TaskStatus,
    currentRunId: row.current_run_id,
    currentArtifactId: row.current_artifact_id,
    idempotencyKey: row.idempotency_key,
    requestDigest: row.request_digest,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toArtifactRecord(row: DbArtifact): ArtifactRecord {
  return {
    id: row.id,
    taskId: row.task_id,
    runId: row.run_id,
    version: Number(row.version),
    kind: row.kind,
    content: row.content,
    contentRef: row.content_ref,
    provenance: (row.provenance ?? {}) as Record<string, unknown>,
    classification: row.classification,
    audience: row.audience,
    validationStatus: row.validation_status,
    createdAt: row.created_at,
  };
}

function toRunEventRecord(row: DbRunEvent): SequencedRunEventRecord {
  return {
    runId: row.run_id,
    sequence: Number(row.sequence),
    type: row.type,
    schemaVersion: Number(row.schema_version),
    payload: (row.payload ?? {}) as Record<string, unknown>,
    createdAt: row.created_at,
  };
}
