import {
  asString,
  CAPABILITY_GITHUB_ISSUES_CREATE,
  CAPABILITY_MCP_ECHO,
  DEFAULT_ALLOW_POLICY,
  GITHUB_ALLOWED_REPO,
  GITHUB_CREATE_ISSUE,
  matchesToken,
  personalChannelId,
  PROVIDER_GITHUB,
  PROVIDER_MOCK_MCP,
  RESOURCE_MCP_ECHO,
  rootAuthority,
  TURN_TOOL_NAMES,
} from '@gabot/common';
import { describe, expect, it, vi } from 'vitest';

import { createApiApp } from './app.js';
import { SCHEMA_SQL } from './db/schema-sql.js';
import * as schema from './db/schema.js';
import { runGatewayAction } from './gateway.js';
import { MemoryStore } from './store/memory-store.js';
import { createScriptedAgentRunner, executeRun, executeTurn } from './turns.js';

import type { PeopleAuthPort, SandboxPort } from '@gabot/common';

const person = { id: 'user-1', email: 'admin@example.com', name: 'Admin' };
const defaultChannel = personalChannelId(person.id);

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

async function ownerRun(store: MemoryStore) {
  await store.upsertUser(person, ['admin@example.com']);
  const workspace = await store.getWorkspaceForUser(person.id);
  if (!workspace) {
    throw new Error('workspace missing');
  }
  const run = await store.createRun({
    workspaceId: workspace.id,
    projectId: workspace.projectId,
    channelId: defaultChannel,
    botId: 'general-assistant',
    ownerUserId: person.id,
    triggerType: 'interactive',
    status: 'running',
    objective: 'test',
    authority: rootAuthority(TURN_TOOL_NAMES),
    depth: 0,
  });
  return { run, workspace };
}

describe('schema sql', () => {
  it('creates vector extension before mastra tables', () => {
    const extension = SCHEMA_SQL.indexOf('CREATE EXTENSION IF NOT EXISTS vector');
    const mastra = SCHEMA_SQL.indexOf('mastra_threads');
    expect(extension).toBeGreaterThanOrEqual(0);
    expect(mastra).toBeGreaterThan(extension);
    expect(schema.users).toBeDefined();
    expect(schema.actionPolicy).toBeDefined();
    expect(schema.workspaces).toBeDefined();
    expect(schema.connections).toBeDefined();
    expect(schema.capabilityGrants).toBeDefined();
    expect(schema.channelPolicies).toBeDefined();
    expect(schema.organizationMembers).toBeDefined();
    expect(SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS runs');
    expect(SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS connections');
    expect(SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS capability_grants');
    expect(SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS channel_policies');
    expect(SCHEMA_SQL).toContain('workspaces_owner_user_id_uidx');
    expect(SCHEMA_SQL).toContain('channels_project_id_fkey');
    expect(SCHEMA_SQL).toContain(
      'INSERT INTO connections (id, workspace_id, owner_user_id, provider, credential_ref, status)',
    );
    expect(SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS organization_members');
    expect(SCHEMA_SQL).toContain("WHERE channel_id = 'general'");
    expect(SCHEMA_SQL).toContain('FROM channel_memberships');
    expect(DEFAULT_ALLOW_POLICY.allow).toEqual(['true']);
    const provision = SCHEMA_SQL.indexOf("ch-' || id || '-general'");
    const retarget = SCHEMA_SQL.indexOf('UPDATE routines');
    expect(provision).toBeGreaterThanOrEqual(0);
    expect(retarget).toBeGreaterThan(provision);
  });
});

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
      channelId: defaultChannel,
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
    const listed = (await channels.json()) as { channels: Array<{ id: string }> };
    const channelId = listed.channels[0]?.id;
    expect(channelId).toBeTruthy();
    const missing = await app.request('/api/channels/nope/messages', { headers });
    expect(missing.status).toBe(404);
    const messages = await app.request(`/api/channels/${channelId}/messages`, { headers });
    expect(messages.status).toBe(200);
    const turn = await app.request(`/api/channels/${channelId}/turns`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message: 'hello' }),
    });
    expect(turn.status).toBe(200);
    expect(turn.headers.get('content-type')).toContain('text/event-stream');
    const participants = await app.request(`/api/channels/${channelId}/participants`, { headers });
    expect(participants.status).toBe(200);
    const events = await app.request(`/api/channels/${channelId}/events`, { headers });
    expect(events.status).toBe(200);
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
      body: JSON.stringify({ channelId, text: 'A person replied.' }),
    });
    expect(handoff.status).toBe(200);
    expect((await app.request('/api/internal/handoff', { method: 'POST' })).status).toBe(401);
    const stolenRoutine = await app.request('/api/internal/routines/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-gabot-worker-secret': 'worker' },
      body: JSON.stringify({
        channelId: personalChannelId('user-2'),
        instruction: 'ping',
        ownerUserId: person.id,
        agentId: 'general-assistant',
      }),
    });
    expect(stolenRoutine.status).toBe(404);
    const outsiderTurn = await app.request(`/api/channels/${channelId}/turns`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message: 'hi', botId: 'stranger' }),
    });
    expect(outsiderTurn.status).toBe(400);
  });

  it('renders a granted component and enqueues a handoff', async () => {
    const store = new MemoryStore();
    const { run } = await ownerRun(store);
    const note = await runGatewayAction({
      store,
      sandbox: sandbox([]),
      mcpUrl: 'http://mcp.test',
      actorId: person.id,
      botId: 'general-assistant',
      toolName: 'component_note',
      args: { title: 'Hi', body: 'There' },
      run,
    });
    expect(note.ok).toBe(true);
    const asked = await runGatewayAction({
      store,
      sandbox: sandbox([]),
      mcpUrl: 'http://mcp.test',
      actorId: person.id,
      botId: 'general-assistant',
      channelId: defaultChannel,
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
      channelId: defaultChannel,
      instruction: 'ping',
      cron: '* * * * *',
      enabled: true,
      timezone: 'UTC',
      nextRunAt: past,
    });
    expect(await store.listDueRoutines(new Date())).toHaveLength(1);
    await store.markRoutineRun('r1', new Date(Date.now() + 86_400_000));
    expect(await store.listDueRoutines(new Date())).toHaveLength(0);
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
      channelId: defaultChannel,
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
      channelId: defaultChannel,
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
      plugins: Array<{ grantedCount: number; id: string; toolCount: number }>;
    };
    expect(catalogue.plugins[0]).toMatchObject({ id: 'mock', toolCount: 2, grantedCount: 0 });
    const granted = await app.request('/api/admin/plugins/mock/grants', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ ref: 'mock/echo', granted: true }),
    });
    expect(granted.status).toBe(200);
    const workspace = await store.getWorkspaceForUser(person.id);
    const afterGrant = workspace ? await store.listCapabilityGrants(workspace.id) : [];
    expect(
      afterGrant.some(
        (grant) => grant.capability === CAPABILITY_MCP_ECHO && grant.resource === RESOURCE_MCP_ECHO,
      ),
    ).toBe(true);
    const detail = await app.request('/api/admin/plugins/mock', { headers });
    const body = (await detail.json()) as {
      tools: Array<{ granted: boolean; name: string }>;
    };
    expect(body.tools.find((tool) => tool.name === 'echo')?.granted).toBe(true);
    const revoked = await app.request('/api/admin/plugins/mock/grants', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ ref: 'mock/echo', granted: false }),
    });
    expect(revoked.status).toBe(200);
    const afterRevoke = workspace ? await store.listCapabilityGrants(workspace.id) : [];
    expect(afterRevoke.some((grant) => grant.capability === CAPABILITY_MCP_ECHO)).toBe(false);
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
    const botId = agentBody.agent.id;
    await store.addChannelParticipant({
      channelId: defaultChannel,
      principalId: botId,
      principalType: 'bot',
      role: 'bot',
    });
    expect(await store.isChannelParticipant(defaultChannel, 'bot', botId)).toBe(true);
    const patched = await app.request(`/api/agents/${botId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ title: 'Renamed' }),
    });
    expect(patched.status).toBe(200);
    expect(((await patched.json()) as { agent: { title: string } }).agent.title).toBe('Renamed');
    expect(
      (await app.request('/api/agents/general-assistant', { method: 'DELETE', headers })).status,
    ).toBe(409);
    expect((await app.request(`/api/agents/${botId}`, { method: 'DELETE', headers })).status).toBe(
      200,
    );
    expect(await store.isChannelParticipant(defaultChannel, 'bot', botId)).toBe(false);

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
      channelId: defaultChannel,
      message: 'schedule a task every minute to say hello',
    });
    const updated = await executeTurn({
      store,
      sandbox: sandbox([]),
      agent: createScriptedAgentRunner(),
      mcpUrl: 'http://mcp.test',
      user: { ...person, isAdmin: true },
      channelId: defaultChannel,
      message: 'change the say hello routine to say hi',
    });
    expect(updated.toolNames).toContain('update_routine');
    const routines = await store.listRoutinesFor(person.id);
    expect(routines[0]?.instruction).toBe('say hi');
  });

  it('provisions a personal workspace and channel per user', async () => {
    const store = new MemoryStore();
    await store.upsertUser(person, ['admin@example.com']);
    await store.upsertUser({ id: 'user-2', email: 'other@example.com', name: 'Other' }, []);
    const first = await store.getWorkspaceForUser(person.id);
    const second = await store.getWorkspaceForUser('user-2');
    expect(first?.ownerUserId).toBe(person.id);
    expect(second?.ownerUserId).toBe('user-2');
    expect(first?.id).not.toBe(second?.id);
    expect(first?.defaultChannelId).not.toBe(second?.defaultChannelId);
  });

  it('persists a root Run for an interactive turn', async () => {
    const store = new MemoryStore();
    await store.upsertUser(person, ['admin@example.com']);
    const result = await executeTurn({
      store,
      sandbox: sandbox([]),
      agent: createScriptedAgentRunner(),
      mcpUrl: 'http://mcp.test',
      user: { ...person, isAdmin: true },
      channelId: defaultChannel,
      message: 'hello',
    });
    const run = await store.getRun(result.runId);
    expect(run?.status).toBe('succeeded');
    expect(run?.parentRunId).toBeNull();
    expect(run?.botId).toBe('general-assistant');
  });

  it('treats a leading @mention as the root bot', async () => {
    const store = new MemoryStore();
    await store.upsertUser(person, ['admin@example.com']);
    const result = await executeTurn({
      store,
      sandbox: sandbox([]),
      agent: createScriptedAgentRunner(),
      mcpUrl: 'http://mcp.test',
      user: { ...person, isAdmin: true },
      channelId: defaultChannel,
      message: '@monitor inspect production errors from the last 24 hours',
    });
    const run = await store.getRun(result.runId);
    expect(run?.botId).toBe('monitor');
    expect(result.toolNames).toContain('delegate_to_bot');
  });

  it('delegates monitor to triage to coder through durable child runs', async () => {
    const store = new MemoryStore();
    await store.upsertUser(person, ['admin@example.com']);
    const deps = {
      store,
      sandbox: sandbox([]),
      agent: createScriptedAgentRunner(),
      mcpUrl: 'http://mcp.test',
      user: { ...person, isAdmin: true },
    };
    const result = await executeTurn({
      ...deps,
      channelId: defaultChannel,
      botId: 'monitor',
      message: 'inspect production errors from the last 24 hours',
    });
    expect(result.toolNames).toContain('delegate_to_bot');
    await drainRuns(deps);
    const runs = await store.listRunsForChannel(defaultChannel);
    expect(runs.filter((row) => row.status === 'succeeded')).toHaveLength(3);
    const hops = await store.listDelegationsForParent(result.runId);
    expect(hops).toHaveLength(1);
    expect(hops[0]?.toBotId).toBe('triage');
    const nested = await store.listDelegationsForParent(hops[0]?.childRunId ?? '');
    expect(nested[0]?.toBotId).toBe('coder');
    const events = await store.listChannelEvents(defaultChannel);
    expect(events.some((row) => row.type === 'agent.delegation.requested')).toBe(true);
    expect(events.some((row) => row.type === 'agent.delegation.completed')).toBe(true);
  });

  it('reclaims a queued child run after a worker restart', async () => {
    const store = new MemoryStore();
    await store.upsertUser(person, ['admin@example.com']);
    const deps = {
      store,
      sandbox: sandbox([]),
      agent: createScriptedAgentRunner(),
      mcpUrl: 'http://mcp.test',
      user: { ...person, isAdmin: true },
    };
    await executeTurn({
      ...deps,
      channelId: defaultChannel,
      botId: 'monitor',
      message: 'inspect production errors from the last 24 hours',
    });
    const lost = await store.claimWork('dead', 10);
    expect(lost[0]?.kind).toBe('run.execute');
    const later = new Date(Date.now() + 6 * 60_000);
    const reclaimed = await store.claimWork('alive', 10, later);
    expect(reclaimed).toHaveLength(1);
    const runId = asString(reclaimed[0]?.payload.runId, reclaimed[0]?.key ?? '');
    const child = await executeRun({ ...deps, runId });
    expect(child.runId).toBe(runId);
    const run = await store.getRun(runId);
    expect(run?.status).toBe('succeeded');
    const app = appWith(store);
    const internal = await app.request('/api/internal/runs/execute', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-gabot-worker-secret': 'worker' },
      body: JSON.stringify({ runId }),
    });
    expect(internal.status).toBe(200);
  });

  it('rejects a root turn for a bot that is not on the channel', async () => {
    const store = new MemoryStore();
    await store.upsertUser(person, ['admin@example.com']);
    await expect(
      executeTurn({
        store,
        sandbox: sandbox([]),
        agent: createScriptedAgentRunner(),
        mcpUrl: 'http://mcp.test',
        user: { ...person, isAdmin: true },
        channelId: defaultChannel,
        botId: 'stranger',
        message: 'hello',
      }),
    ).rejects.toThrow('not a participant');
    expect(await store.listMessages(defaultChannel)).toHaveLength(0);
  });

  it('resumes a running child run after a crash', async () => {
    const store = new MemoryStore();
    await store.upsertUser(person, ['admin@example.com']);
    const workspace = await store.getWorkspaceForUser(person.id);
    const run = await store.createRun({
      workspaceId: workspace?.id ?? '',
      projectId: workspace?.projectId ?? '',
      channelId: defaultChannel,
      botId: 'coder',
      ownerUserId: person.id,
      triggerType: 'delegation',
      status: 'running',
      objective: 'already in flight',
      authority: rootAuthority(['delegate_to_bot']),
      depth: 1,
    });
    const result = await executeRun({
      store,
      sandbox: sandbox([]),
      agent: createScriptedAgentRunner(),
      mcpUrl: 'http://mcp.test',
      user: { ...person, isAdmin: true },
      runId: run.id,
    });
    expect(result.text).toBeDefined();
    expect((await store.getRun(run.id))?.status).toBe('succeeded');
  });

  it('does not rerun a failed hop', async () => {
    const store = new MemoryStore();
    await store.upsertUser(person, ['admin@example.com']);
    const workspace = await store.getWorkspaceForUser(person.id);
    const run = await store.createRun({
      workspaceId: workspace?.id ?? '',
      projectId: workspace?.projectId ?? '',
      channelId: defaultChannel,
      botId: 'coder',
      ownerUserId: person.id,
      triggerType: 'delegation',
      status: 'failed',
      objective: 'already failed',
      authority: rootAuthority(['delegate_to_bot']),
      depth: 1,
    });
    const result = await executeRun({
      store,
      sandbox: sandbox([]),
      agent: createScriptedAgentRunner(),
      mcpUrl: 'http://mcp.test',
      user: { ...person, isAdmin: true },
      runId: run.id,
    });
    expect(result).toEqual({ runId: run.id, text: '', toolNames: [] });
    expect((await store.getRun(run.id))?.status).toBe('failed');
  });

  it('schedules routines on the run channel even when args include another channelId', async () => {
    const store = new MemoryStore();
    await store.upsertUser(person, ['admin@example.com']);
    const other = { id: 'user-2', email: 'other@example.com', name: 'Other' };
    await store.upsertUser(other, []);
    const workspace = await store.getWorkspaceForUser(person.id);
    const run = await store.createRun({
      workspaceId: workspace?.id ?? '',
      projectId: workspace?.projectId ?? '',
      channelId: defaultChannel,
      botId: 'general-assistant',
      ownerUserId: person.id,
      triggerType: 'interactive',
      status: 'running',
      objective: 'schedule',
      authority: rootAuthority(['create_routine']),
      depth: 0,
    });
    const result = await runGatewayAction({
      store,
      sandbox: sandbox([]),
      mcpUrl: 'http://mcp.test',
      actorId: person.id,
      botId: 'general-assistant',
      toolName: 'create_routine',
      args: {
        instruction: 'say hello',
        cron: '* * * * *',
        channelId: personalChannelId(other.id),
      },
      channelId: defaultChannel,
      run,
    });
    expect(result.ok).toBe(true);
    const mine = await store.listRoutinesFor(person.id);
    expect(mine[0]?.channelId).toBe(defaultChannel);
    expect(await store.listRoutinesFor(other.id)).toHaveLength(0);
  });

  it('hides another workspace audit trail from the current user', async () => {
    const store = new MemoryStore();
    const app = appWith(store);
    const headers = { authorization: 'Bearer good-token', 'content-type': 'application/json' };
    expect((await app.request('/api/me', { headers })).status).toBe(200);
    await store.insertAudit({
      actorUserId: 'user-2',
      eventType: 'computer.navigate',
      targetType: 'computer',
      payload: { workspaceId: 'ws-user-2', url: 'https://secret.example' },
    });
    const trail = await app.request('/api/admin/audit-events?limit=25', { headers });
    expect(JSON.stringify(await trail.json())).not.toContain('secret.example');
  });

  it('denies a child tool that is outside the parent envelope', async () => {
    const store = new MemoryStore();
    await store.upsertUser(person, ['admin@example.com']);
    const workspace = await store.getWorkspaceForUser(person.id);
    expect(workspace).toBeTruthy();
    const run = await store.createRun({
      workspaceId: workspace?.id ?? '',
      projectId: workspace?.projectId ?? '',
      channelId: defaultChannel,
      botId: 'coder',
      ownerUserId: person.id,
      triggerType: 'delegation',
      status: 'running',
      objective: 'navigate',
      authority: rootAuthority(['delegate_to_bot']),
      depth: 1,
    });
    const result = await runGatewayAction({
      store,
      sandbox: sandbox([]),
      mcpUrl: 'http://mcp.test',
      actorId: person.id,
      botId: 'coder',
      toolName: 'computer_navigate',
      args: { url: 'https://example.com' },
      channelId: defaultChannel,
      run,
    });
    expect(result.ok).toBe(false);
    expect(result.output.toLowerCase()).toContain('not authorized');
  });

  it('refuses a fourth delegation hop', async () => {
    const store = new MemoryStore();
    await store.upsertUser(person, ['admin@example.com']);
    const workspace = await store.getWorkspaceForUser(person.id);
    const run = await store.createRun({
      workspaceId: workspace?.id ?? '',
      projectId: workspace?.projectId ?? '',
      channelId: defaultChannel,
      botId: 'monitor',
      ownerUserId: person.id,
      triggerType: 'interactive',
      status: 'running',
      objective: 'go deeper',
      authority: rootAuthority(['delegate_to_bot']),
      depth: 3,
    });
    const result = await runGatewayAction({
      store,
      sandbox: sandbox([]),
      mcpUrl: 'http://mcp.test',
      actorId: person.id,
      botId: 'monitor',
      toolName: 'delegate_to_bot',
      args: { botId: 'triage', objective: 'too deep' },
      channelId: defaultChannel,
      run,
    });
    expect(result.ok).toBe(false);
    expect(result.output.toLowerCase()).toContain('depth');
  });
});

describe('capability grants', () => {
  it('refuses a non-owner participant from starting a run that spends owner grants', async () => {
    const store = new MemoryStore();
    await store.upsertUser(person, ['admin@example.com']);
    await store.upsertUser({ id: 'user-2', email: 'other@example.com', name: 'Other' }, []);
    await store.addChannelParticipant({
      channelId: defaultChannel,
      principalId: 'user-2',
      principalType: 'user',
      role: 'member',
    });
    await expect(
      executeTurn({
        store,
        sandbox: sandbox([]),
        agent: createScriptedAgentRunner(),
        mcpUrl: 'http://mcp.test',
        user: { id: 'user-2', email: 'other@example.com', isAdmin: false, name: 'Other' },
        channelId: defaultChannel,
        message: 'create an issue on acme/allowed',
      }),
    ).rejects.toThrow(/workspace owner/);
  });

  it('refuses MCP echo until the workspace grant exists, then allows it', async () => {
    const store = new MemoryStore();
    const { run, workspace } = await ownerRun(store);
    const denied = await runGatewayAction({
      store,
      sandbox: sandbox([]),
      mcpUrl: 'http://mcp.test',
      actorId: person.id,
      botId: 'general-assistant',
      toolName: 'mcp__mock__echo',
      args: { text: 'hello' },
      run,
    });
    expect(denied.ok).toBe(false);
    expect(denied.output.toLowerCase()).toContain('grant');
    await store.setCapabilityGrant({
      workspaceId: workspace.id,
      ownerUserId: workspace.ownerUserId,
      provider: PROVIDER_MOCK_MCP,
      capability: CAPABILITY_MCP_ECHO,
      resource: RESOURCE_MCP_ECHO,
      granted: true,
      grantedBy: person.id,
    });
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ result: { content: [{ text: 'hello' }] } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const allowed = await runGatewayAction({
      store,
      sandbox: sandbox([]),
      mcpUrl: 'http://mcp.test',
      actorId: person.id,
      botId: 'general-assistant',
      toolName: 'mcp__mock__echo',
      args: { text: 'hello' },
      run,
    });
    vi.unstubAllGlobals();
    expect(allowed.ok).toBe(true);
  });

  it('stubs GitHub issue create for the granted repo and denies another', async () => {
    const store = new MemoryStore();
    const { run } = await ownerRun(store);
    const allowed = await runGatewayAction({
      store,
      sandbox: sandbox([]),
      mcpUrl: 'http://mcp.test',
      actorId: person.id,
      botId: 'general-assistant',
      toolName: GITHUB_CREATE_ISSUE,
      args: { repo: GITHUB_ALLOWED_REPO, title: 'Outage' },
      run,
    });
    expect(allowed.ok).toBe(true);
    expect(allowed.output).toContain(GITHUB_ALLOWED_REPO);
    const denied = await runGatewayAction({
      store,
      sandbox: sandbox([]),
      mcpUrl: 'http://mcp.test',
      actorId: person.id,
      botId: 'general-assistant',
      toolName: GITHUB_CREATE_ISSUE,
      args: { repo: 'acme/other', title: 'Outage' },
      run,
    });
    expect(denied.ok).toBe(false);
    expect(denied.matched).toBe('grant');
    const trail = await store.listAudit(10);
    const denyRow = trail.find((row) => row.payload.resource === 'acme/other');
    expect(denyRow?.payload).toMatchObject({
      capability: CAPABILITY_GITHUB_ISSUES_CREATE,
      resource: 'acme/other',
      decision: 'deny',
      ownerUserId: person.id,
      botId: 'general-assistant',
      runId: run.id,
    });
    const allowRow = trail.find((row) => row.payload.resource === GITHUB_ALLOWED_REPO);
    expect(allowRow?.payload).toMatchObject({
      capability: CAPABILITY_GITHUB_ISSUES_CREATE,
      resource: GITHUB_ALLOWED_REPO,
      decision: 'allow',
      ownerUserId: person.id,
      botId: 'general-assistant',
      runId: run.id,
    });
    expect(typeof allowRow?.payload.connectionId).toBe('string');
  });

  it('allows a granted resource when the channel has no policy rows', async () => {
    const store = new MemoryStore();
    const { run } = await ownerRun(store);
    const allowed = await runGatewayAction({
      store,
      sandbox: sandbox([]),
      mcpUrl: 'http://mcp.test',
      actorId: person.id,
      botId: 'general-assistant',
      toolName: GITHUB_CREATE_ISSUE,
      args: { repo: GITHUB_ALLOWED_REPO, title: 'Outage' },
      run,
    });
    expect(allowed.ok).toBe(true);
  });

  it('intersects a broader workspace grant with a channel allow-list', async () => {
    const store = new MemoryStore();
    const { run, workspace } = await ownerRun(store);
    await store.setCapabilityGrant({
      workspaceId: workspace.id,
      ownerUserId: workspace.ownerUserId,
      provider: PROVIDER_GITHUB,
      capability: CAPABILITY_GITHUB_ISSUES_CREATE,
      resource: 'acme/denied',
      granted: true,
      grantedBy: person.id,
    });
    const headers = { authorization: 'Bearer good-token', 'content-type': 'application/json' };
    const app = appWith(store);
    const saved = await app.request(`/api/channels/${defaultChannel}/policies`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        policies: [{ capability: CAPABILITY_GITHUB_ISSUES_CREATE, resource: GITHUB_ALLOWED_REPO }],
      }),
    });
    expect(saved.status).toBe(200);
    const listed = await app.request(`/api/channels/${defaultChannel}/policies`, { headers });
    expect(listed.status).toBe(200);
    const allowed = await runGatewayAction({
      store,
      sandbox: sandbox([]),
      mcpUrl: 'http://mcp.test',
      actorId: person.id,
      botId: 'general-assistant',
      toolName: GITHUB_CREATE_ISSUE,
      args: { repo: GITHUB_ALLOWED_REPO, title: 'Outage' },
      run,
    });
    expect(allowed.ok).toBe(true);
    const denied = await runGatewayAction({
      store,
      sandbox: sandbox([]),
      mcpUrl: 'http://mcp.test',
      actorId: person.id,
      botId: 'general-assistant',
      toolName: GITHUB_CREATE_ISSUE,
      args: { repo: 'acme/denied', title: 'Outage' },
      run,
    });
    expect(denied.ok).toBe(false);
    expect(denied.matched).toBe('channel-policy');
  });

  it('does not revoke a slash repo when a hyphenated alias is written', async () => {
    const store = new MemoryStore();
    const { run, workspace } = await ownerRun(store);
    await store.setCapabilityGrant({
      workspaceId: workspace.id,
      ownerUserId: workspace.ownerUserId,
      provider: PROVIDER_GITHUB,
      capability: CAPABILITY_GITHUB_ISSUES_CREATE,
      resource: 'octo/foo-bar',
      granted: true,
      grantedBy: person.id,
    });
    await store.setCapabilityGrant({
      workspaceId: workspace.id,
      ownerUserId: workspace.ownerUserId,
      provider: PROVIDER_GITHUB,
      capability: CAPABILITY_GITHUB_ISSUES_CREATE,
      resource: 'octo-foo/bar',
      granted: true,
      grantedBy: person.id,
    });
    await store.setCapabilityGrant({
      workspaceId: workspace.id,
      ownerUserId: workspace.ownerUserId,
      provider: PROVIDER_GITHUB,
      capability: CAPABILITY_GITHUB_ISSUES_CREATE,
      resource: 'acme-allowed',
      granted: false,
      grantedBy: person.id,
    });
    const grants = await store.listCapabilityGrants(workspace.id);
    const githubResources = grants
      .filter((grant) => grant.capability === CAPABILITY_GITHUB_ISSUES_CREATE)
      .map((grant) => grant.resource)
      .sort();
    expect(githubResources).toEqual(['acme/allowed', 'octo-foo/bar', 'octo/foo-bar']);
    const allowed = await runGatewayAction({
      store,
      sandbox: sandbox([]),
      mcpUrl: 'http://mcp.test',
      actorId: person.id,
      botId: 'general-assistant',
      toolName: GITHUB_CREATE_ISSUE,
      args: { repo: GITHUB_ALLOWED_REPO, title: 'Outage' },
      run,
    });
    expect(allowed.ok).toBe(true);
  });

  it('does not restore a revoked default grant after upsertUser or getUser', async () => {
    const store = new MemoryStore();
    const { run, workspace } = await ownerRun(store);
    await store.setCapabilityGrant({
      workspaceId: workspace.id,
      ownerUserId: workspace.ownerUserId,
      provider: PROVIDER_GITHUB,
      capability: CAPABILITY_GITHUB_ISSUES_CREATE,
      resource: GITHUB_ALLOWED_REPO,
      granted: false,
      grantedBy: person.id,
    });
    await store.upsertUser(person, ['admin@example.com']);
    await store.getUser(person.id);
    const denied = await runGatewayAction({
      store,
      sandbox: sandbox([]),
      mcpUrl: 'http://mcp.test',
      actorId: person.id,
      botId: 'general-assistant',
      toolName: GITHUB_CREATE_ISSUE,
      args: { repo: GITHUB_ALLOWED_REPO, title: 'Outage' },
      run,
    });
    expect(denied.ok).toBe(false);
    expect(denied.matched).toBe('grant');
  });

  it('seeds the GitHub grant when a workspace is created', async () => {
    const store = new MemoryStore();
    const other = { id: 'user-3', email: 'third@example.com', name: 'Third' };
    await store.upsertUser(other, []);
    const workspace = await store.getWorkspaceForUser(other.id);
    if (!workspace) {
      throw new Error('workspace missing');
    }
    const grants = await store.listCapabilityGrants(workspace.id);
    expect(
      grants.some(
        (grant) =>
          grant.capability === CAPABILITY_GITHUB_ISSUES_CREATE &&
          grant.resource === GITHUB_ALLOWED_REPO,
      ),
    ).toBe(true);
  });

  it('lists owner connections', async () => {
    const store = new MemoryStore();
    const app = appWith(store);
    const headers = { authorization: 'Bearer good-token', 'content-type': 'application/json' };
    const response = await app.request('/api/admin/connections', { headers });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      connections: Array<{ credentialRef: string; provider: string }>;
    };
    expect(body.connections.map((row) => row.provider).sort()).toEqual([
      'gabot',
      'github',
      'mock-mcp',
    ]);
    expect(body.connections.every((row) => row.credentialRef.length > 0)).toBe(true);
  });
});

describe('projects and channels', () => {
  it('lists the default project and creates another', async () => {
    const store = new MemoryStore();
    const app = appWith(store);
    const headers = { authorization: 'Bearer good-token', 'content-type': 'application/json' };
    const listed = await app.request('/api/projects', { headers });
    expect(listed.status).toBe(200);
    const body = (await listed.json()) as { projects: Array<{ id: string; name: string }> };
    expect(body.projects.some((row) => row.name === 'Default')).toBe(true);
    const created = await app.request('/api/projects', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'Research' }),
    });
    expect(created.status).toBe(201);
    const after = (await (await app.request('/api/projects', { headers })).json()) as {
      projects: Array<{ name: string }>;
    };
    expect(after.projects.map((row) => row.name)).toEqual(
      expect.arrayContaining(['Default', 'Research']),
    );
    const workspace = await store.getWorkspaceForUser(person.id);
    expect(workspace?.projectId).toBe(body.projects[0]?.id);
  });

  it('creates a channel in a non-default project', async () => {
    const store = new MemoryStore();
    const app = appWith(store);
    const headers = { authorization: 'Bearer good-token', 'content-type': 'application/json' };
    await app.request('/api/me', { headers });
    const workspace = await store.getWorkspaceForUser(person.id);
    if (!workspace) {
      throw new Error('workspace missing');
    }
    const project = await store.createProject({ workspaceId: workspace.id, name: 'Ops' });
    const created = await app.request('/api/channels', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'Incidents', projectId: project.id, description: 'Oncall' }),
    });
    expect(created.status).toBe(201);
    const body = (await created.json()) as {
      channel: { description: string; id: string; name: string; projectId: string };
    };
    expect(body.channel).toMatchObject({
      name: 'Incidents',
      projectId: project.id,
      description: 'Oncall',
    });
    const scope = await store.getChannelScope(body.channel.id);
    expect(scope?.projectId).toBe(project.id);
  });

  it('rejects a project owned by another workspace', async () => {
    const store = new MemoryStore();
    const app = appWith(store);
    const headers = { authorization: 'Bearer good-token', 'content-type': 'application/json' };
    await store.upsertUser(person, ['admin@example.com']);
    await store.upsertUser({ id: 'user-2', email: 'other@example.com', name: 'Other' }, []);
    const other = await store.getWorkspaceForUser('user-2');
    const created = await app.request('/api/channels', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'Stolen', projectId: other?.projectId }),
    });
    expect(created.status).toBe(404);
  });

  it('adds a bot participant and refuses a human', async () => {
    const store = new MemoryStore();
    const app = appWith(store);
    const headers = { authorization: 'Bearer good-token', 'content-type': 'application/json' };
    const agent = await app.request('/api/agents', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'Researcher', title: 'Researcher' }),
    });
    const profile = (await agent.json()) as { agent: { id: string } };
    const added = await app.request(`/api/channels/${defaultChannel}/participants`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ agentId: profile.agent.id }),
    });
    expect(added.status).toBe(201);
    const human = await app.request(`/api/channels/${defaultChannel}/participants`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ agentId: person.id }),
    });
    expect(human.status).toBe(403);
    const removed = await app.request(
      `/api/channels/${defaultChannel}/participants/${profile.agent.id}`,
      { method: 'DELETE', headers },
    );
    expect(removed.status).toBe(200);
    const roster = (await (
      await app.request(`/api/channels/${defaultChannel}/participants`, { headers })
    ).json()) as { participants: Array<{ principalId: string }> };
    expect(roster.participants.some((row) => row.principalId === profile.agent.id)).toBe(false);
  });

  it('archives a channel so it is omitted from the list', async () => {
    const store = new MemoryStore();
    const app = appWith(store);
    const headers = { authorization: 'Bearer good-token', 'content-type': 'application/json' };
    const created = await app.request('/api/channels', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'Temp' }),
    });
    const channel = (await created.json()) as { channel: { id: string } };
    const archived = await app.request(`/api/channels/${channel.channel.id}/archive`, {
      method: 'POST',
      headers,
    });
    expect(archived.status).toBe(200);
    const listed = (await (await app.request('/api/channels', { headers })).json()) as {
      channels: Array<{ id: string; name: string }>;
    };
    expect(listed.channels.some((row) => row.id === channel.channel.id)).toBe(false);
    expect(listed.channels.some((row) => row.name === 'General')).toBe(true);
  });

  it('does not restore a removed default bot after upsertUser or getUser', async () => {
    const store = new MemoryStore();
    const app = appWith(store);
    const headers = { authorization: 'Bearer good-token', 'content-type': 'application/json' };
    const removed = await app.request(`/api/channels/${defaultChannel}/participants/coder`, {
      method: 'DELETE',
      headers,
    });
    expect(removed.status).toBe(200);
    await store.upsertUser(person, ['admin@example.com']);
    await store.getUser(person.id);
    const roster = (await (
      await app.request(`/api/channels/${defaultChannel}/participants`, { headers })
    ).json()) as { participants: Array<{ principalId: string }> };
    expect(roster.participants.some((row) => row.principalId === 'coder')).toBe(false);
  });

  it('refuses to archive the default General channel', async () => {
    const store = new MemoryStore();
    const app = appWith(store);
    const headers = { authorization: 'Bearer good-token', 'content-type': 'application/json' };
    const archived = await app.request(`/api/channels/${defaultChannel}/archive`, {
      method: 'POST',
      headers,
    });
    expect(archived.status).toBe(400);
    const listed = (await (await app.request('/api/channels', { headers })).json()) as {
      channels: Array<{ name: string }>;
    };
    expect(listed.channels.some((row) => row.name === 'General')).toBe(true);
  });

  it('keeps a single workspace per owner after a second upsert', async () => {
    const store = new MemoryStore();
    await store.upsertUser(person, ['admin@example.com']);
    await store.upsertUser(person, ['admin@example.com']);
    await store.upsertUser({ id: 'user-2', email: 'other@example.com', name: 'Other' }, []);
    const first = await store.getWorkspaceForUser(person.id);
    const second = await store.getWorkspaceForUser('user-2');
    expect(first?.id).not.toBe(second?.id);
    expect(first?.ownerUserId).toBe(person.id);
    expect(second?.ownerUserId).toBe('user-2');
    const extra = await store.createProject({ workspaceId: first?.id ?? '', name: 'Ops' });
    const after = await store.getWorkspaceForUser(person.id);
    expect(after?.projectId).not.toBe(extra.id);
    expect(after?.projectId).toBe(first?.projectId);
  });
});

async function drainRuns(deps: {
  agent: ReturnType<typeof createScriptedAgentRunner>;
  mcpUrl: string;
  sandbox: ReturnType<typeof sandbox>;
  store: MemoryStore;
  user: { email: string; id: string; isAdmin: boolean; name: string };
}): Promise<void> {
  for (let step = 0; step < 8; step += 1) {
    const items = await deps.store.claimWork(`drain-${String(step)}`, 10);
    const jobs = items.filter((item) => item.kind === 'run.execute');
    if (jobs.length === 0) {
      return;
    }
    for (const item of jobs) {
      const runId = asString(item.payload.runId, item.key);
      await executeRun({ ...deps, runId });
      await deps.store.finishWork(item.kind, item.key);
    }
  }
}
