import {
  createScriptedPeopleAuth,
  DEFAULT_DIAGNOSIS_CRITERIA,
  DEFAULT_WORKSPACE_ID,
  workspaceDefaultChannelId,
} from '@gabot/common';
import { describe, expect, it } from 'vitest';

import { createApiApp } from './app.js';
import { MemoryStore } from './store/memory-store.js';
import { TaskIdempotencyConflictError } from './store/types.js';
import { createScriptedAgentRunner } from './turns.js';

import type { VerifiedPerson } from '@gabot/common';

const TEST_ISSUER = 'https://id.test/gabot';
const TEST_AUDIENCE = 'backend-a';
const person: VerifiedPerson = {
  id: 'user-1',
  email: 'admin@example.com',
  name: 'Admin',
  identity: { issuer: TEST_ISSUER, subject: 'user-1' },
};
const admins = [person.identity];
const peopleAuth = createScriptedPeopleAuth({
  issuer: TEST_ISSUER,
  audience: TEST_AUDIENCE,
  secret: 'test-secret',
});
const goodToken = peopleAuth.mintIdToken({
  subject: person.id,
  email: person.email,
  name: person.name,
});
const defaultChannel = workspaceDefaultChannelId(DEFAULT_WORKSPACE_ID);

function appWith(store: MemoryStore) {
  return createApiApp({
    store,
    peopleAuth,
    agent: createScriptedAgentRunner(),
    mcpUrl: 'http://mcp.test',
    workerSecret: 'worker',
    adminIdentities: admins,
  });
}

describe('durable task MVP', () => {
  it('admits a task before execution and returns stable ids', async () => {
    const store = new MemoryStore();
    await store.upsertUser(person, admins);
    const app = appWith(store);
    const response = await app.request('/v1/tasks', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${goodToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        objective: 'Investigate CI failure on lint',
        channelId: defaultChannel,
        idempotencyKey: 'task-key-1',
      }),
    });
    expect(response.status).toBe(202);
    const body = (await response.json()) as {
      created: boolean;
      runId: string;
      status: string;
      taskId: string;
    };
    expect(body.created).toBe(true);
    expect(body.status).toBe('queued');
    expect(body.taskId).toBeTruthy();
    expect(body.runId).toBeTruthy();
    const snapshot = await store.getTaskSnapshot(body.taskId);
    expect(snapshot?.task.successCriteria).toBe(DEFAULT_DIAGNOSIS_CRITERIA);
    expect(snapshot?.artifact).toBeNull();
  });

  it('replays the same admission for identical idempotency key+digest', async () => {
    const store = new MemoryStore();
    await store.upsertUser(person, admins);
    const app = appWith(store);
    const payload = {
      objective: 'Investigate CI failure on lint',
      channelId: defaultChannel,
      idempotencyKey: 'task-key-dup',
    };
    const first = await app.request('/v1/tasks', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${goodToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const second = await app.request('/v1/tasks', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${goodToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    expect(first.status).toBe(202);
    expect(second.status).toBe(200);
    const a = (await first.json()) as { runId: string; taskId: string };
    const b = (await second.json()) as { created: boolean; runId: string; taskId: string };
    expect(b.created).toBe(false);
    expect(b.taskId).toBe(a.taskId);
    expect(b.runId).toBe(a.runId);
  });

  it('rejects conflicting digest for the same idempotency key', async () => {
    const store = new MemoryStore();
    await store.upsertUser(person, admins);
    await expect(
      store.admitTask({
        workspaceId: DEFAULT_WORKSPACE_ID,
        projectId: (await store.getWorkspaceForUser(person.id))!.projectId,
        channelId: defaultChannel,
        botId: 'general-assistant',
        ownerUserId: person.id,
        objective: 'one',
        audience: 'creator',
        successCriteria: DEFAULT_DIAGNOSIS_CRITERIA,
        resourceScope: [],
        idempotencyKey: 'conflict-key',
        requestDigest: 'digest-a',
        authority: { allowedTools: [] },
      }),
    ).resolves.toMatchObject({ created: true });
    await expect(
      store.admitTask({
        workspaceId: DEFAULT_WORKSPACE_ID,
        projectId: (await store.getWorkspaceForUser(person.id))!.projectId,
        channelId: defaultChannel,
        botId: 'general-assistant',
        ownerUserId: person.id,
        objective: 'two',
        audience: 'creator',
        successCriteria: DEFAULT_DIAGNOSIS_CRITERIA,
        resourceScope: [],
        idempotencyKey: 'conflict-key',
        requestDigest: 'digest-b',
        authority: { allowedTools: [] },
      }),
    ).rejects.toBeInstanceOf(TaskIdempotencyConflictError);
  });

  it('executes via worker path and reconnects to a completed artifact', async () => {
    const store = new MemoryStore();
    await store.upsertUser(person, admins);
    const app = appWith(store);
    const admitted = await app.request('/v1/tasks', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${goodToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        objective: 'Investigate CI failure on lint',
        channelId: defaultChannel,
        idempotencyKey: 'task-key-exec',
      }),
    });
    const body = (await admitted.json()) as { runId: string; taskId: string };
    const executed = await app.request('/api/internal/runs/execute', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-gabot-worker-secret': 'worker',
      },
      body: JSON.stringify({ runId: body.runId, workerId: 'worker-1' }),
    });
    expect(executed.status).toBe(200);
    const snapshot = await app.request(`/v1/tasks/${body.taskId}`, {
      headers: { authorization: `Bearer ${goodToken}` },
    });
    expect(snapshot.status).toBe(200);
    const detail = (await snapshot.json()) as {
      artifact: { content: string; version: number } | null;
      task: { status: string };
    };
    expect(detail.task.status).toBe('completed');
    expect(detail.artifact?.version).toBe(1);
    expect(detail.artifact?.content).toMatch(/## Observations/i);
    expect(detail.artifact?.content).toMatch(/## Hypotheses/i);

    const events = await app.request(`/v1/runs/${body.runId}/events?after=0`, {
      headers: { authorization: `Bearer ${goodToken}` },
    });
    const eventBody = (await events.json()) as { events: { type: string }[] };
    expect(eventBody.events.some((event) => event.type === 'task.admitted')).toBe(true);
    expect(eventBody.events.some((event) => event.type === 'artifact.persisted')).toBe(true);
  });
});
