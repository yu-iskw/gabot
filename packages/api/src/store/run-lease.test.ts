import {
  DEFAULT_WORKSPACE_ID,
  rootAuthority,
  TURN_TOOL_NAMES,
  workspaceDefaultChannelId,
  type VerifiedPerson,
} from '@gabot/common';
import { describe, expect, it } from 'vitest';

import { MemoryStore } from './memory-store.js';
import { RUN_EXECUTE_KIND, RUN_LEASE_LOST, WORK_LEASE_MS } from './types.js';

import type { RootRunAdmission } from './types.js';

const person: VerifiedPerson = {
  id: 'user-1',
  email: 'admin@example.com',
  name: 'Admin',
  identity: { issuer: 'https://id.test/gabot', subject: 'user-1' },
};
const defaultChannel = workspaceDefaultChannelId(DEFAULT_WORKSPACE_ID);
const now = new Date('2026-09-07T00:00:00.000Z');

async function seededStore(): Promise<{ store: MemoryStore; admission: RootRunAdmission }> {
  const store = new MemoryStore();
  await store.upsertUser(person, [person.identity]);
  const workspace = await store.getWorkspaceForUser(person.id);
  if (!workspace) {
    throw new Error('workspace missing');
  }
  return {
    store,
    admission: {
      workspaceId: workspace.id,
      projectId: workspace.projectId,
      channelId: defaultChannel,
      botId: 'general-assistant',
      ownerUserId: person.id,
      triggerType: 'interactive',
      message: 'hello from admit',
      authority: rootAuthority(TURN_TOOL_NAMES),
      executorId: 'http-1',
      now,
    },
  };
}

describe('root run lease', () => {
  it('admits a queued root with a claimed run.execute row and channel events', async () => {
    const { store, admission } = await seededStore();
    const admitted = await store.admitRootRun(admission);
    expect(admitted.run.status).toBe('queued');
    expect(admitted.run.depth).toBe(0);
    expect(admitted.run.rootRunId).toBe(admitted.run.id);
    expect(admitted.lease.executorId).toBe('http-1');
    expect(admitted.lease.leaseUntil.getTime()).toBe(now.getTime() + WORK_LEASE_MS);

    const messages = await store.listMessages(defaultChannel);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.role).toBe('user');
    expect(messages[0]?.content).toBe('hello from admit');
    expect((await store.getChannel(defaultChannel, person.id))?.lastMessage).toBe(
      'hello from admit',
    );

    const events = await store.listChannelEvents(defaultChannel);
    expect(events.map((row) => row.type)).toEqual(['message.user', 'run.started']);
    expect(await store.claimWork('jobs', 10, now)).toHaveLength(0);
  });

  it('lets a worker claim and start a leftover queued root after the HTTP lease lapses', async () => {
    const { store, admission } = await seededStore();
    const admitted = await store.admitRootRun(admission);
    const later = new Date(now.getTime() + 6 * 60_000);
    const claimed = await store.claimWork('jobs', 10, later);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.kind).toBe(RUN_EXECUTE_KIND);
    expect(claimed[0]?.key).toBe(admitted.run.id);

    const acquired = await store.acquireRun({
      runId: admitted.run.id,
      executorId: 'jobs',
      now: later,
    });
    expect(acquired.outcome).toBe('started');
    expect((await store.getRun(admitted.run.id))?.status).toBe('running');
  });

  it('returns busy when another executor holds a live lease', async () => {
    const { store, admission } = await seededStore();
    const admitted = await store.admitRootRun(admission);
    const acquired = await store.acquireRun({
      runId: admitted.run.id,
      executorId: 'http-2',
      now,
    });
    expect(acquired.outcome).toBe('busy');
    expect((await store.getRun(admitted.run.id))?.status).toBe('queued');
  });

  it('reaps a stale running run to failed instead of replaying it', async () => {
    const { store, admission } = await seededStore();
    const admitted = await store.admitRootRun(admission);
    await store.acquireRun({ runId: admitted.run.id, executorId: 'http-1', now });
    const later = new Date(now.getTime() + 6 * 60_000);
    const acquired = await store.acquireRun({
      runId: admitted.run.id,
      executorId: 'jobs',
      now: later,
    });
    expect(acquired.outcome).toBe('lost');
    const run = await store.getRun(admitted.run.id);
    expect(run?.status).toBe('failed');
    expect(run?.error).toBe(RUN_LEASE_LOST);
    const events = await store.listChannelEvents(defaultChannel);
    expect(events.some((row) => row.type === 'run.failed')).toBe(true);
  });

  it('renews only for the holder and settle refuses a foreign executor', async () => {
    const { store, admission } = await seededStore();
    const admitted = await store.admitRootRun(admission);
    await store.acquireRun({ runId: admitted.run.id, executorId: 'http-1', now });
    expect(
      await store.renewRunLease({ runId: admitted.run.id, executorId: 'http-1', now }),
    ).toMatchObject({ executorId: 'http-1' });
    expect(
      await store.renewRunLease({ runId: admitted.run.id, executorId: 'jobs', now }),
    ).toBeNull();
    expect(
      await store.settleRun({
        runId: admitted.run.id,
        executorId: 'jobs',
        status: 'succeeded',
        assistantContent: 'ghost',
        now,
      }),
    ).toBeNull();
    expect(await store.listMessages(defaultChannel)).toHaveLength(1);
    const settled = await store.settleRun({
      runId: admitted.run.id,
      executorId: 'http-1',
      status: 'succeeded',
      assistantContent: 'done',
      now,
    });
    expect(settled?.status).toBe('succeeded');
    expect((await store.getRun(admitted.run.id))?.status).toBe('succeeded');
    const messages = await store.listMessages(defaultChannel);
    expect(messages.at(-1)?.role).toBe('assistant');
    expect(messages.at(-1)?.content).toBe('done');
  });
});
