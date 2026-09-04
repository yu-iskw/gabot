import { Hono } from 'hono';

import type postgres from 'postgres';

type JobSql = ReturnType<typeof postgres>;

async function claimWork(
  sql: JobSql,
  workerId: string,
  limit: number,
): Promise<Array<{ kind: string; key: string; payload: Record<string, unknown> }>> {
  return sql`
    UPDATE work_items AS w
    SET claimed_by = ${workerId},
        lease_until = now() + interval '5 minutes',
        attempts = w.attempts + 1,
        updated_at = now()
    FROM (
      SELECT kind, key
      FROM work_items
      WHERE finished_at IS NULL
        AND run_at <= now()
        AND (claimed_by IS NULL OR lease_until < now())
      ORDER BY run_at
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    ) AS taken
    WHERE w.kind = taken.kind AND w.key = taken.key
    RETURNING w.kind, w.key, w.payload
  `;
}

async function finishWork(sql: JobSql, kind: string, key: string, error?: string): Promise<void> {
  await sql`
    UPDATE work_items
    SET finished_at = now(), last_error = ${error ?? null}, updated_at = now()
    WHERE kind = ${kind} AND key = ${key}
  `;
}

async function unclaimWork(sql: JobSql, kind: string, key: string, error: string): Promise<void> {
  await sql`
    UPDATE work_items
    SET claimed_by = NULL, lease_until = NULL, last_error = ${error}, updated_at = now()
    WHERE kind = ${kind} AND key = ${key} AND finished_at IS NULL
  `;
}

async function holdWork(sql: JobSql, kind: string, key: string, error: string): Promise<void> {
  await sql`
    UPDATE work_items
    SET last_error = ${error}, updated_at = now()
    WHERE kind = ${kind} AND key = ${key} AND finished_at IS NULL
  `;
}

export function runExecuteFailureDisposition(
  status: string | undefined,
): 'finish' | 'hold' | 'unclaim' {
  if (status === 'queued') {
    return 'unclaim';
  }
  if (status === 'running') {
    return 'hold';
  }
  return 'finish';
}

async function enqueueDueRoutines(sql: JobSql, now = new Date()): Promise<number> {
  const routines = await sql<
    {
      id: string;
      channel_id: string;
      instruction: string;
      owner_user_id: string;
      agent_id: string;
    }[]
  >`
    SELECT id, channel_id, instruction, owner_user_id, agent_id FROM routines
    WHERE enabled = true AND next_run_at <= ${now}
  `;
  for (const routine of routines) {
    await sql`
      INSERT INTO work_items (kind, key, payload)
      VALUES (
        'routine.run',
        ${`${routine.id}:${now.toISOString().slice(0, 16)}`},
        ${sql.json({
          routineId: routine.id,
          channelId: routine.channel_id,
          instruction: routine.instruction,
          ownerUserId: routine.owner_user_id,
          agentId: routine.agent_id,
        })}
      )
      ON CONFLICT DO NOTHING
    `;
    await sql`
      UPDATE routines SET last_run_at = now(), next_run_at = ${new Date(now.getTime() + 86_400_000)}
      WHERE id = ${routine.id}
    `;
  }
  return routines.length;
}

export async function deliverHandoff(
  item: { key: string; payload: Record<string, unknown> },
  apiUrl: string,
  secret: string,
): Promise<void> {
  const channelId = typeof item.payload.channelId === 'string' ? item.payload.channelId : '';
  if (!channelId) {
    throw new Error('handoff payload missing channelId');
  }
  const prompt =
    typeof item.payload.prompt === 'string'
      ? item.payload.prompt
      : 'A coworker asked for a person.';
  await fetch(`${apiUrl.replace(/\/$/, '')}/api/internal/handoff`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-gabot-worker-secret': secret },
    body: JSON.stringify({ channelId, text: `Handoff: ${prompt}` }),
  });
}

export async function deliverRoutine(
  item: { key: string; payload: Record<string, unknown> },
  apiUrl: string,
  secret: string,
): Promise<void> {
  await postInternal(apiUrl, '/api/internal/routines/run', secret, item.payload);
}

export async function deliverRun(
  item: { key: string; payload: Record<string, unknown> },
  apiUrl: string,
  secret: string,
): Promise<void> {
  const runId = typeof item.payload.runId === 'string' ? item.payload.runId : item.key;
  await postInternal(apiUrl, '/api/internal/runs/execute', secret, { runId });
}

async function postInternal(
  apiUrl: string,
  path: string,
  secret: string,
  body: unknown,
): Promise<void> {
  const response = await fetch(`${apiUrl.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-gabot-worker-secret': secret },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? `HTTP ${String(response.status)}`);
  }
}

export async function runTick(input: {
  sql: JobSql;
  apiUrl: string;
  secret: string;
  workerId: string;
}): Promise<{ claimed: number; routines: number }> {
  const routines = await enqueueDueRoutines(input.sql);
  const claimed = await claimWork(input.sql, input.workerId, 10);
  for (const item of claimed) {
    await handleItem(item, input);
  }
  return { claimed: claimed.length, routines };
}

async function handleItem(
  item: { kind: string; key: string; payload: Record<string, unknown> },
  input: { sql: JobSql; apiUrl: string; secret: string },
): Promise<void> {
  try {
    switch (item.kind) {
      case 'computer.cull': {
        break;
      }
      case 'handoff': {
        await deliverHandoff(item, input.apiUrl, input.secret);
        break;
      }
      case 'routine.run': {
        await deliverRoutine(item, input.apiUrl, input.secret);
        break;
      }
      case 'run.execute': {
        await deliverRun(item, input.apiUrl, input.secret);
        break;
      }
      default: {
        break;
      }
    }
    await finishWork(input.sql, item.kind, item.key);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'job failed';
    if (item.kind === 'run.execute') {
      const runId = typeof item.payload.runId === 'string' ? item.payload.runId : item.key;
      const rows = await input.sql<{ status: string }[]>`
        SELECT status FROM runs WHERE id = ${runId}
      `;
      const disposition = runExecuteFailureDisposition(rows.at(0)?.status);
      if (disposition === 'unclaim') {
        await unclaimWork(input.sql, item.kind, item.key, message);
        return;
      }
      if (disposition === 'hold') {
        await holdWork(input.sql, item.kind, item.key, message);
        return;
      }
    }
    await finishWork(input.sql, item.kind, item.key, message);
  }
}

export function createJobsApp(tick: () => Promise<unknown>): Hono {
  const app = new Hono();
  app.get('/health', async (context) => {
    await tick();
    return context.json({ status: 'ok', role: 'jobs' });
  });
  app.post('/tick', async (context) => context.json(await tick()));
  return app;
}
