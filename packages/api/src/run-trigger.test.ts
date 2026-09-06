import {
  createScriptedPeopleAuth,
  DEFAULT_WORKSPACE_ID,
  workspaceDefaultChannelId,
} from '@gabot/common';
import { describe, expect, it } from 'vitest';

import { createApiApp } from './app.js';
import { MemoryStore } from './store/memory-store.js';
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
const defaultChannel = workspaceDefaultChannelId(DEFAULT_WORKSPACE_ID);
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

describe('run trigger at admit', () => {
  it('stores a channel turn as interactive', async () => {
    const store = new MemoryStore();
    await store.upsertUser(person, admins);
    const app = appWith(store);
    const headers = { authorization: `Bearer ${goodToken}`, 'content-type': 'application/json' };
    const turn = await app.request(`/api/channels/${defaultChannel}/turns`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message: 'hello' }),
    });
    expect(turn.status).toBe(200);
    const runs = await store.listRunsForChannel(defaultChannel);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.triggerType).toBe('interactive');
  });

  it('stores a routine occurrence as routine', async () => {
    const store = new MemoryStore();
    await store.upsertUser(person, admins);
    const app = appWith(store);
    const response = await app.request('/api/internal/routines/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-gabot-worker-secret': 'worker' },
      body: JSON.stringify({
        channelId: defaultChannel,
        instruction: 'ping',
        ownerUserId: person.id,
        agentId: 'general-assistant',
      }),
    });
    expect(response.status).toBe(200);
    const runs = await store.listRunsForChannel(defaultChannel);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.triggerType).toBe('routine');
    const started = (await store.listChannelEvents(defaultChannel)).find(
      (row) => row.type === 'run.started',
    );
    expect(started?.payload.trigger).toBe('routine');
  });
});
