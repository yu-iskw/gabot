import { DEFAULT_ALLOW_POLICY, matchesToken } from '@gabot/common';
import { describe, expect, it } from 'vitest';

import { createApiApp } from './app.js';
import { SCHEMA_SQL } from './db/schema-sql.js';
import * as schema from './db/schema.js';
import { runGatewayAction } from './gateway.js';
import { MemoryStore } from './store/memory-store.js';
import { createScriptedAgentRunner, executeTurn } from './turns.js';

import type { PeopleAuthPort, SandboxPort } from '@gabot/common';

const person = { id: 'user-1', email: 'admin@example.com', name: 'Admin' };

const peopleAuth: PeopleAuthPort = {
  verifyIdToken: (token: string) => {
    if (!matchesToken('good-token', token)) {
      return Promise.reject(new Error('bad token'));
    }
    return Promise.resolve(person);
  },
};

function sandbox(navigations: string[]): SandboxPort {
  return {
    navigate: (_botId, url) => {
      navigations.push(url);
      return Promise.resolve({ ok: true, url, title: 'Example Domain', text: 'Example Domain' });
    },
    screenshot: () => Promise.resolve({ ok: true, base64: 'aaaa', width: 800 }),
  };
}

function appWith(store: MemoryStore, navigations: string[] = []) {
  return createApiApp({
    store,
    peopleAuth,
    sandbox: sandbox(navigations),
    agent: createScriptedAgentRunner(),
    mcpUrl: 'http://mcp.test',
    workerSecret: 'worker',
    adminEmails: ['admin@example.com'],
  });
}

describe('control plane', () => {
  it('refuses missing bearer tokens', async () => {
    const app = appWith(new MemoryStore());
    const response = await app.request('/api/me');
    expect(response.status).toBe(401);
  });

  it('accepts a verified identity platform token', async () => {
    const app = appWith(new MemoryStore());
    const response = await app.request('/api/me', {
      headers: { authorization: 'Bearer good-token' },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ email: person.email, isAdmin: true });
  });

  it('navigates through the gateway and writes computer audit', async () => {
    const store = new MemoryStore();
    const navigations: string[] = [];
    const app = appWith(store, navigations);
    const headers = { authorization: 'Bearer good-token', 'content-type': 'application/json' };
    const response = await app.request('/api/computers/general-assistant/navigate', {
      method: 'POST',
      headers,
      body: JSON.stringify({ url: 'https://example.com' }),
    });
    expect(response.status).toBe(200);
    expect(navigations).toEqual(['https://example.com']);
    const trail = await app.request('/api/admin/audit-events?limit=10', { headers });
    const body = (await trail.json()) as { events: Array<{ eventType: string }> };
    expect(body.events.some((event) => event.eventType.startsWith('computer.'))).toBe(true);
  });

  it('refuses a deny rule and names it in audit', async () => {
    const store = new MemoryStore();
    const app = appWith(store);
    const headers = { authorization: 'Bearer good-token', 'content-type': 'application/json' };
    await app.request('/api/computers/policy', {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        mode: 'enforce',
        deny: ['contains(page.host, "example.com")'],
        allow: ['true'],
      }),
    });
    const refused = await app.request('/api/computers/general-assistant/navigate', {
      method: 'POST',
      headers,
      body: JSON.stringify({ url: 'https://example.com' }),
    });
    expect(refused.status).toBe(403);
    const trail = (await (
      await app.request('/api/admin/audit-events?limit=10', { headers })
    ).json()) as { events: Array<{ eventType: string; payload: { rule?: string } }> };
    const row = trail.events.find((event) => event.eventType.includes('refused'));
    expect(row?.payload.rule).toContain('example.com');
  });

  it('streams a scripted navigate turn', async () => {
    const store = new MemoryStore();
    await store.upsertUser(person, ['admin@example.com']);
    const result = await executeTurn({
      store,
      sandbox: sandbox([]),
      agent: createScriptedAgentRunner(),
      mcpUrl: 'http://mcp.test',
      user: { ...person, isAdmin: true },
      channelId: 'general',
      message: 'please navigate to example.com',
    });
    expect(result.toolNames).toContain('computer_navigate');
    expect(result.text.toLowerCase()).toContain('example.com');
  });

  it('refuses MCP echo without a grant', async () => {
    const store = new MemoryStore();
    const result = await runGatewayAction({
      store,
      sandbox: sandbox([]),
      mcpUrl: 'http://mcp.test',
      actorId: person.id,
      botId: 'general-assistant',
      toolName: 'mcp__mock__echo',
      args: { text: 'hello' },
    });
    expect(result.ok).toBe(false);
    expect(result.output.toLowerCase()).toContain('grant');
  });

  it('claims work items with skip-locked semantics in memory', async () => {
    const store = new MemoryStore();
    await store.enqueueWork({ kind: 'handoff', key: 'a', payload: { prompt: 'hi' } });
    const first = await store.claimWork('w1', 10);
    const second = await store.claimWork('w2', 10);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
    await store.finishWork('handoff', 'a');
  });

  it('creates vector extension before mastra tables', () => {
    const extension = SCHEMA_SQL.indexOf('CREATE EXTENSION IF NOT EXISTS vector');
    const mastra = SCHEMA_SQL.indexOf('mastra_threads');
    expect(extension).toBeGreaterThanOrEqual(0);
    expect(mastra).toBeGreaterThan(extension);
    expect(schema.users).toBeDefined();
    expect(schema.actionPolicy).toBeDefined();
    expect(DEFAULT_ALLOW_POLICY.allow).toEqual(['true']);
  });

  it('covers session, computer, turn, and internal routes', async () => {
    const store = new MemoryStore();
    const app = appWith(store);
    const headers = { authorization: 'Bearer good-token', 'content-type': 'application/json' };
    expect((await app.request('/health')).status).toBe(200);
    expect(
      (await app.request('/api/me', { headers: { authorization: 'Bearer nope' } })).status,
    ).toBe(401);
    const channels = await app.request('/api/channels', { headers });
    expect(channels.status).toBe(200);
    const missing = await app.request('/api/channels/nope/messages', { headers });
    expect(missing.status).toBe(404);
    const messages = await app.request('/api/channels/general/messages', { headers });
    expect(messages.status).toBe(200);
    const turn = await app.request('/api/channels/general/turns', {
      method: 'POST',
      headers,
      body: JSON.stringify({ message: 'hello' }),
    });
    expect(turn.status).toBe(200);
    expect(turn.headers.get('content-type')).toContain('text/event-stream');
    const shot = await app.request('/api/computers/general-assistant/screenshot', {
      method: 'POST',
      headers,
      body: '{}',
    });
    expect(shot.status).toBe(200);
    const live = await app.request('/api/computers/general-assistant/screenshot', { headers });
    expect(live.status).toBe(200);
    const policy = await app.request('/api/computers/policy', { headers });
    expect(policy.status).toBe(200);
    const handoff = await app.request('/api/internal/handoff', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-gabot-worker-secret': 'worker' },
      body: JSON.stringify({ channelId: 'general', text: 'A person replied.' }),
    });
    expect(handoff.status).toBe(200);
    expect((await app.request('/api/internal/handoff', { method: 'POST' })).status).toBe(401);
  });

  it('renders a granted component and enqueues a handoff', async () => {
    const store = new MemoryStore();
    const note = await runGatewayAction({
      store,
      sandbox: sandbox([]),
      mcpUrl: 'http://mcp.test',
      actorId: person.id,
      botId: 'general-assistant',
      toolName: 'component_note',
      args: { title: 'Hi', body: 'There' },
    });
    expect(note.ok).toBe(true);
    const asked = await runGatewayAction({
      store,
      sandbox: sandbox([]),
      mcpUrl: 'http://mcp.test',
      actorId: person.id,
      botId: 'general-assistant',
      toolName: 'ask_person',
      args: { prompt: 'Need help' },
    });
    expect(asked.ok).toBe(true);
    const unknown = await runGatewayAction({
      store,
      sandbox: sandbox([]),
      mcpUrl: 'http://mcp.test',
      actorId: person.id,
      botId: 'general-assistant',
      toolName: 'nope',
      args: {},
    });
    expect(unknown.ok).toBe(false);
  });

  it('reclaims expired work leases and runs due routines', async () => {
    const store = new MemoryStore();
    const past = new Date(Date.now() - 60_000);
    await store.enqueueWork({ kind: 'computer.cull', key: 'bot-1', payload: {}, runAt: past });
    await store.claimWork('dead', 1, new Date(Date.now() - 10 * 60_000));
    const again = await store.claimWork('alive', 1, new Date());
    expect(again).toHaveLength(1);
    store.addRoutine({
      id: 'r1',
      ownerUserId: person.id,
      agentId: 'general-assistant',
      channelId: 'general',
      instruction: 'ping',
      cron: '* * * * *',
      enabled: true,
      timezone: 'UTC',
      nextRunAt: past,
    });
    expect(await store.listDueRoutines(new Date())).toHaveLength(1);
    await store.markRoutineRun('r1', new Date(Date.now() + 86_400_000));
    expect(await store.listDueRoutines(new Date())).toHaveLength(0);
    expect(await store.hasGrant('general-assistant', 'component', 'component_note')).toBe(true);
    await store.enqueueWork({ kind: 'handoff', key: 'a', payload: {} });
    await store.enqueueWork({ kind: 'handoff', key: 'a', payload: {} });
  });

  it('creates a coworker from a bot turn and lists it', async () => {
    const store = new MemoryStore();
    await store.upsertUser(person, ['admin@example.com']);
    const result = await executeTurn({
      store,
      sandbox: sandbox([]),
      agent: createScriptedAgentRunner(),
      mcpUrl: 'http://mcp.test',
      user: { ...person, isAdmin: true },
      channelId: 'general',
      message: 'please create a bot named Research',
    });
    expect(result.toolNames).toContain('create_bot');
    const agents = await store.listAgents();
    expect(agents.some((agent) => agent.name === 'Research')).toBe(true);
    const app = appWith(store);
    const headers = { authorization: 'Bearer good-token', 'content-type': 'application/json' };
    const listed = await app.request('/api/agents', { headers });
    expect(listed.status).toBe(200);
    const created = await app.request('/api/agents', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'Ops', title: 'Ops', roleDescription: 'Ops bot' }),
    });
    expect(created.status).toBe(201);
  });

  it('schedules a routine from a bot turn', async () => {
    const store = new MemoryStore();
    await store.upsertUser(person, ['admin@example.com']);
    const result = await executeTurn({
      store,
      sandbox: sandbox([]),
      agent: createScriptedAgentRunner(),
      mcpUrl: 'http://mcp.test',
      user: { ...person, isAdmin: true },
      channelId: 'general',
      message: 'schedule a task every minute to say hello',
    });
    expect(result.toolNames).toContain('create_routine');
    const routines = await store.listRoutinesFor(person.id);
    expect(routines).toHaveLength(1);
    const app = appWith(store);
    const headers = { authorization: 'Bearer good-token', 'content-type': 'application/json' };
    expect((await app.request('/api/routines', { headers })).status).toBe(200);
    expect((await app.request('/api/skills', { headers })).status).toBe(200);
    expect((await app.request('/api/admin/people', { headers })).status).toBe(200);
    expect((await app.request('/api/admin/plugins', { headers })).status).toBe(200);
    expect((await app.request('/api/computers', { headers })).status).toBe(200);
  });

  it('grants an MCP tool so a bot may call it, and revokes it again', async () => {
    const store = new MemoryStore();
    const app = appWith(store);
    const headers = { authorization: 'Bearer good-token', 'content-type': 'application/json' };
    const listed = await app.request('/api/admin/plugins', { headers });
    const catalogue = (await listed.json()) as {
      plugins: Array<{ botCount: number; id: string; toolCount: number }>;
    };
    expect(catalogue.plugins[0]).toMatchObject({ id: 'mock', toolCount: 2, botCount: 0 });
    const granted = await app.request('/api/admin/plugins/mock/grants', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ agentId: 'general-assistant', ref: 'mock/echo', granted: true }),
    });
    expect(granted.status).toBe(200);
    expect(await store.hasGrant('general-assistant', 'mcp', 'mock/echo')).toBe(true);
    const detail = await app.request('/api/admin/plugins/mock', { headers });
    const body = (await detail.json()) as {
      tools: Array<{ grantedTo: string[]; name: string }>;
    };
    expect(body.tools.find((tool) => tool.name === 'echo')?.grantedTo).toEqual([
      'general-assistant',
    ]);
    const revoked = await app.request('/api/admin/plugins/mock/grants', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ agentId: 'general-assistant', ref: 'mock/echo', granted: false }),
    });
    expect(revoked.status).toBe(200);
    expect(await store.hasGrant('general-assistant', 'mcp', 'mock/echo')).toBe(false);
    expect((await app.request('/api/agents/general-assistant', { headers })).status).toBe(200);
    expect((await app.request('/api/agents/missing', { headers })).status).toBe(404);
  });

  it('patches and deletes agents, upserts skills, and updates routines conversationally', async () => {
    const store = new MemoryStore();
    await store.upsertUser(person, ['admin@example.com']);
    const app = appWith(store);
    const headers = { authorization: 'Bearer good-token', 'content-type': 'application/json' };
    const created = await app.request('/api/agents', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'Temp', title: 'Temp', roleDescription: 'temp' }),
    });
    expect(created.status).toBe(201);
    const agentBody = (await created.json()) as { agent: { id: string } };
    const patched = await app.request(`/api/agents/${agentBody.agent.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ title: 'Renamed' }),
    });
    expect(patched.status).toBe(200);
    expect(((await patched.json()) as { agent: { title: string } }).agent.title).toBe('Renamed');
    expect(
      (await app.request('/api/agents/general-assistant', { method: 'DELETE', headers })).status,
    ).toBe(409);
    expect(
      (await app.request(`/api/agents/${agentBody.agent.id}`, { method: 'DELETE', headers }))
        .status,
    ).toBe(200);

    const skill = await app.request('/api/skills', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        slug: 'brief-me',
        title: 'Brief me',
        summary: 'Short brief',
        instructions: 'Write three bullets.',
      }),
    });
    expect(skill.status).toBe(200);
    const skillList = await app.request('/api/skills', { headers });
    const skills = (await skillList.json()) as {
      skills: Array<{ instructions: string; slug: string }>;
    };
    expect(skills.skills.some((row) => row.slug === 'brief-me' && row.instructions)).toBe(true);

    await executeTurn({
      store,
      sandbox: sandbox([]),
      agent: createScriptedAgentRunner(),
      mcpUrl: 'http://mcp.test',
      user: { ...person, isAdmin: true },
      channelId: 'general',
      message: 'schedule a task every minute to say hello',
    });
    const updated = await executeTurn({
      store,
      sandbox: sandbox([]),
      agent: createScriptedAgentRunner(),
      mcpUrl: 'http://mcp.test',
      user: { ...person, isAdmin: true },
      channelId: 'general',
      message: 'change the say hello routine to say hi',
    });
    expect(updated.toolNames).toContain('update_routine');
    const routines = await store.listRoutinesFor(person.id);
    expect(routines[0]?.instruction).toBe('say hi');
  });
});
