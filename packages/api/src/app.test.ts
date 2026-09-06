import {
  asString,
  CAPABILITY_GITHUB_ISSUES_CREATE,
  CAPABILITY_MCP_ECHO,
  createScriptedPeopleAuth,
  DEFAULT_ALLOW_POLICY,
  DEFAULT_WORKSPACE_ID,
  GITHUB_ALLOWED_REPO,
  GITHUB_CREATE_ISSUE,
  MCP_ECHO,
  personalChannelId,
  PROVIDER_GITHUB,
  PROVIDER_MOCK_MCP,
  RESOURCE_MCP_ECHO,
  rootAuthority,
  TURN_TOOL_NAMES,
  workspaceDefaultChannelId,
} from '@gabot/common';
import { describe, expect, it, vi } from 'vitest';

import { createApiApp } from './app.js';
import { SCHEMA_SQL } from './db/schema-sql.js';
import * as schema from './db/schema.js';
import { runGatewayAction } from './gateway.js';
import { MemoryStore } from './store/memory-store.js';
import { createScriptedAgentRunner, executeRun, executeTurn } from './turns.js';

import type { VerifiedPerson } from '@gabot/common';

const TEST_ISSUER = 'https://id.test/gabot';
const TEST_AUDIENCE = 'backend-a';

function verifiedPerson(
  id: string,
  email: string,
  name: string,
  issuer = TEST_ISSUER,
): VerifiedPerson {
  return { id, email, name, identity: { issuer, subject: id } };
}

const person = verifiedPerson('user-1', 'admin@example.com', 'Admin');
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

function scriptedDeps(store: MemoryStore) {
  return {
    store,
    agent: createScriptedAgentRunner(),
    mcpUrl: 'http://mcp.test',
    user: { ...person, isAdmin: true },
  };
}

async function ownerRun(store: MemoryStore) {
  await store.upsertUser(person, admins);
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
    expect(schema.workspaceMembers).toBeDefined();
    expect(SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS runs');
    expect(SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS connections');
    expect(SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS capability_grants');
    expect(SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS channel_policies');
    expect(SCHEMA_SQL).toContain('users_identity_uidx');
    expect(SCHEMA_SQL).toContain('DROP INDEX IF EXISTS workspaces_owner_user_id_uidx');
    expect(SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS workspace_members');
    expect(SCHEMA_SQL).not.toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS workspaces_owner_user_id_uidx',
    );
    expect(SCHEMA_SQL).toContain('channels_project_id_fkey');
    expect(SCHEMA_SQL).toContain(
      'INSERT INTO connections (id, workspace_id, owner_user_id, provider, credential_ref, status)',
    );
    expect(SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS organization_members');
    expect(SCHEMA_SQL).toContain("WHERE channel_id = 'general'");
    expect(SCHEMA_SQL).toContain('FROM channel_memberships');
    expect(SCHEMA_SQL).toContain("cp.principal_type = 'user'");
    expect(DEFAULT_ALLOW_POLICY.allow).toEqual(['true']);
    const membership = SCHEMA_SQL.indexOf('CREATE TABLE IF NOT EXISTS workspace_members');
    const retarget = SCHEMA_SQL.indexOf('UPDATE routines');
    expect(membership).toBeGreaterThanOrEqual(0);
    expect(retarget).toBeGreaterThan(membership);
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
      headers: { authorization: `Bearer ${goodToken}` },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      email: person.email,
      isAdmin: true,
      identity: person.identity,
    });
  });

  it('keeps two subjects with the same email as separate users', async () => {
    const store = new MemoryStore();
    const left = verifiedPerson('user-1', 'same@example.com', 'Left');
    const right = verifiedPerson(
      'user-2',
      'same@example.com',
      'Right',
      'https://id.other.test/gabot',
    );
    const first = await store.upsertUser(left, [left.identity]);
    const second = await store.upsertUser(right, []);
    expect(first.id).toBe('user-1');
    expect(second.id).toBe('user-2');
    expect(second.isAdmin).toBe(false);
    expect(first.identity.subject).not.toBe(second.identity.subject);
  });

  it('rejects a token minted for another backend audience', async () => {
    const otherAuth = createScriptedPeopleAuth({
      issuer: TEST_ISSUER,
      audience: 'backend-b',
      secret: 'test-secret',
    });
    const foreign = otherAuth.mintIdToken({
      subject: person.id,
      email: person.email,
      name: person.name,
    });
    const response = await appWith(new MemoryStore()).request('/api/me', {
      headers: { authorization: `Bearer ${foreign}` },
    });
    expect(response.status).toBe(401);
  });

  it('reads and writes action policy on the admin route', async () => {
    const store = new MemoryStore();
    const app = appWith(store);
    const headers = { authorization: `Bearer ${goodToken}`, 'content-type': 'application/json' };
    const listed = await app.request('/api/admin/action-policy', { headers });
    expect(listed.status).toBe(200);
    const saved = await app.request('/api/admin/action-policy', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ mode: 'enforce', deny: ['true'], allow: ['true'] }),
    });
    expect(saved.status).toBe(200);
    const body = (await saved.json()) as { policy: { deny: string[] } };
    expect(body.policy.deny).toEqual(['true']);
  });

  it('does not expose computer routes', async () => {
    const app = appWith(new MemoryStore());
    const headers = { authorization: `Bearer ${goodToken}` };
    expect((await app.request('/api/computers', { headers })).status).toBe(404);
    expect((await app.request('/api/computers/policy', { headers })).status).toBe(404);
    expect(
      (await app.request('/api/computers/general-assistant/screenshot', { headers })).status,
    ).toBe(404);
  });

  it('refuses a deny rule and names it in audit', async () => {
    const store = new MemoryStore();
    const app = appWith(store);
    const headers = { authorization: `Bearer ${goodToken}`, 'content-type': 'application/json' };
    await app.request('/api/admin/action-policy', {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        mode: 'enforce',
        deny: ['true'],
        allow: ['true'],
      }),
    });
    const refused = await runGatewayAction({
      store,
      mcpUrl: 'http://mcp.test',
      actorId: person.id,
      botId: 'general-assistant',
      toolName: MCP_ECHO,
      args: { text: 'hello' },
    });
    expect(refused.ok).toBe(false);
    const trail = (await (
      await app.request('/api/admin/audit-events?limit=10', { headers })
    ).json()) as { events: Array<{ eventType: string; payload: { rule?: string } }> };
    const row = trail.events.find((event) => event.eventType.includes('refused'));
    expect(row?.payload.rule).toBe('true');
  });

  it('streams a scripted hello turn', async () => {
    const store = new MemoryStore();
    await store.upsertUser(person, admins);
    const result = await executeTurn({
      store,
      agent: createScriptedAgentRunner(),
      mcpUrl: 'http://mcp.test',
      user: { ...person, isAdmin: true },
      channelId: defaultChannel,
      message: 'hello',
    });
    expect(result.toolNames).toEqual([]);
    expect(result.text.toLowerCase()).toContain('gabot');
  });

  it('refuses MCP echo without a grant', async () => {
    const store = new MemoryStore();
    const result = await runGatewayAction({
      store,
      mcpUrl: 'http://mcp.test',
      actorId: person.id,
      botId: 'general-assistant',
      toolName: MCP_ECHO,
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

  it('covers session, turn, and internal routes', async () => {
    const store = new MemoryStore();
    const app = appWith(store);
    const headers = { authorization: `Bearer ${goodToken}`, 'content-type': 'application/json' };
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
    const policy = await app.request('/api/admin/action-policy', { headers });
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
    await store.enqueueWork({ kind: 'handoff', key: 'bot-1', payload: {}, runAt: past });
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
    await store.upsertUser(person, admins);
    const result = await executeTurn({
      store,
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
    const headers = { authorization: `Bearer ${goodToken}`, 'content-type': 'application/json' };
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
    await store.upsertUser(person, admins);
    const result = await executeTurn({
      store,
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
    const headers = { authorization: `Bearer ${goodToken}`, 'content-type': 'application/json' };
    expect((await app.request('/api/routines', { headers })).status).toBe(200);
    expect((await app.request('/api/skills', { headers })).status).toBe(200);
    expect((await app.request('/api/admin/people', { headers })).status).toBe(200);
    expect((await app.request('/api/admin/plugins', { headers })).status).toBe(200);
    expect((await app.request('/api/admin/action-policy', { headers })).status).toBe(200);
  });

  it('grants an MCP tool so a bot may call it, and revokes it again', async () => {
    const store = new MemoryStore();
    const app = appWith(store);
    const headers = { authorization: `Bearer ${goodToken}`, 'content-type': 'application/json' };
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
    await store.upsertUser(person, admins);
    const app = appWith(store);
    const headers = { authorization: `Bearer ${goodToken}`, 'content-type': 'application/json' };
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
      agent: createScriptedAgentRunner(),
      mcpUrl: 'http://mcp.test',
      user: { ...person, isAdmin: true },
      channelId: defaultChannel,
      message: 'schedule a task every minute to say hello',
    });
    const updated = await executeTurn({
      store,
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

  it('joins two users to one backend workspace with distinct roles', async () => {
    const store = new MemoryStore();
    await store.upsertUser(person, admins);
    const other = verifiedPerson('user-2', 'other@example.com', 'Other');
    await store.upsertUser(other, []);
    await store.upsertMembership({ userId: other.id, role: 'member', status: 'active' });
    const first = await store.getWorkspaceForUser(person.id);
    const second = await store.getWorkspaceForUser(other.id);
    expect(first?.id).toBe(DEFAULT_WORKSPACE_ID);
    expect(second?.id).toBe(first?.id);
    expect(first?.defaultChannelId).toBe(defaultChannel);
    expect(second?.defaultChannelId).toBe(first?.defaultChannelId);
    expect((await store.getMembership(person.id))?.role).toBe('admin');
    expect((await store.getMembership(other.id))?.role).toBe('member');
    expect(await store.getWorkspaceForUser(other.id)).toEqual(first);
  });
});

describe('turns and runs', () => {
  it('persists a root Run for an interactive turn', async () => {
    const store = new MemoryStore();
    await store.upsertUser(person, admins);
    const result = await executeTurn({
      store,
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

  it('uses a remaining participant when the default bot was removed', async () => {
    const store = new MemoryStore();
    const app = appWith(store);
    const headers = { authorization: `Bearer ${goodToken}`, 'content-type': 'application/json' };
    const removed = await app.request(
      `/api/channels/${defaultChannel}/participants/general-assistant`,
      { method: 'DELETE', headers },
    );
    expect(removed.status).toBe(200);
    const result = await executeTurn({
      store,
      agent: createScriptedAgentRunner(),
      mcpUrl: 'http://mcp.test',
      user: { ...person, isAdmin: true },
      channelId: defaultChannel,
      message: 'hello',
    });
    const run = await store.getRun(result.runId);
    expect(run?.status).toBe('succeeded');
    expect(run?.botId).not.toBe('general-assistant');
    expect(run?.botId).toBeTruthy();
  });

  it('treats a leading @mention as the root bot', async () => {
    const store = new MemoryStore();
    await store.upsertUser(person, admins);
    const result = await executeTurn({
      store,
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
    await store.upsertUser(person, admins);
    const deps = scriptedDeps(store);
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
    await store.upsertUser(person, admins);
    const deps = scriptedDeps(store);
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
    await store.upsertUser(person, admins);
    await expect(
      executeTurn({
        store,
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
    await store.upsertUser(person, admins);
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
    await store.upsertUser(person, admins);
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
    await store.upsertUser(person, admins);
    const other = verifiedPerson('user-2', 'other@example.com', 'Other');
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
    const headers = { authorization: `Bearer ${goodToken}`, 'content-type': 'application/json' };
    expect((await app.request('/api/me', { headers })).status).toBe(200);
    await store.insertAudit({
      actorUserId: 'user-2',
      eventType: 'mcp.called',
      targetType: 'bot',
      payload: { workspaceId: 'ws-user-2', url: 'https://secret.example' },
    });
    const trail = await app.request('/api/admin/audit-events?limit=25', { headers });
    expect(JSON.stringify(await trail.json())).not.toContain('secret.example');
  });

  it('denies a child tool that is outside the parent envelope', async () => {
    const store = new MemoryStore();
    await store.upsertUser(person, admins);
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
      objective: 'echo',
      authority: rootAuthority(['delegate_to_bot']),
      depth: 1,
    });
    const result = await runGatewayAction({
      store,
      mcpUrl: 'http://mcp.test',
      actorId: person.id,
      botId: 'coder',
      toolName: MCP_ECHO,
      args: { text: 'hello' },
      channelId: defaultChannel,
      run,
    });
    expect(result.ok).toBe(false);
    expect(result.output.toLowerCase()).toContain('not authorized');
  });

  it('refuses a fourth delegation hop', async () => {
    const store = new MemoryStore();
    await store.upsertUser(person, admins);
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
  it('refuses a non-member from starting a run that spends owner grants', async () => {
    const store = new MemoryStore();
    await store.upsertUser(person, admins);
    const other = verifiedPerson('user-2', 'other@example.com', 'Other');
    await store.upsertUser(other, []);
    await store.addChannelParticipant({
      channelId: defaultChannel,
      principalId: other.id,
      principalType: 'user',
      role: 'member',
    });
    await expect(
      executeTurn({
        store,
        agent: createScriptedAgentRunner(),
        mcpUrl: 'http://mcp.test',
        user: { ...other, isAdmin: false },
        channelId: defaultChannel,
        message: 'create an issue on acme/allowed',
      }),
    ).rejects.toThrow(/membership/);
  });

  it('lets an active member start a run on a shared channel', async () => {
    const store = new MemoryStore();
    await store.upsertUser(person, admins);
    const other = verifiedPerson('user-2', 'other@example.com', 'Other');
    await store.upsertUser(other, []);
    await store.upsertMembership({ userId: other.id, role: 'member', status: 'active' });
    const result = await executeTurn({
      store,
      agent: createScriptedAgentRunner(),
      mcpUrl: 'http://mcp.test',
      user: { ...other, isAdmin: false },
      channelId: defaultChannel,
      message: 'hello',
    });
    const run = await store.getRun(result.runId);
    expect(run?.ownerUserId).toBe(other.id);
    expect(run?.workspaceId).toBe(DEFAULT_WORKSPACE_ID);
  });

  it('refuses MCP echo until the workspace grant exists, then allows it', async () => {
    const store = new MemoryStore();
    const { run, workspace } = await ownerRun(store);
    const denied = await runGatewayAction({
      store,
      mcpUrl: 'http://mcp.test',
      actorId: person.id,
      botId: 'general-assistant',
      toolName: MCP_ECHO,
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
      mcpUrl: 'http://mcp.test',
      actorId: person.id,
      botId: 'general-assistant',
      toolName: MCP_ECHO,
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
    const headers = { authorization: `Bearer ${goodToken}`, 'content-type': 'application/json' };
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
    await store.upsertUser(person, admins);
    await store.getUser(person.id);
    const denied = await runGatewayAction({
      store,
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
    await store.upsertUser(person, admins);
    const workspace = await store.getWorkspaceForUser(person.id);
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
    const headers = { authorization: `Bearer ${goodToken}`, 'content-type': 'application/json' };
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
    const headers = { authorization: `Bearer ${goodToken}`, 'content-type': 'application/json' };
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
    const headers = { authorization: `Bearer ${goodToken}`, 'content-type': 'application/json' };
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
    const cleared = await app.request(`/api/channels/${body.channel.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ description: '' }),
    });
    expect(cleared.status).toBe(200);
    const afterClear = (await cleared.json()) as { channel: { description: string } };
    expect(afterClear.channel.description).toBe('');
    const keep = await app.request(`/api/channels/${body.channel.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ description: 'Kept' }),
    });
    expect(keep.status).toBe(200);
    const omitted = await app.request(`/api/channels/${body.channel.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({}),
    });
    expect(omitted.status).toBe(200);
    const afterOmit = (await omitted.json()) as { channel: { description: string } };
    expect(afterOmit.channel.description).toBe('Kept');
    const scope = await store.getChannelScope(body.channel.id);
    expect(scope?.projectId).toBe(project.id);
  });

  it('rejects a project owned by another workspace', async () => {
    const store = new MemoryStore();
    const app = appWith(store);
    const headers = { authorization: `Bearer ${goodToken}`, 'content-type': 'application/json' };
    await store.upsertUser(person, admins);
    const foreign = await store.createProject({ workspaceId: 'ws-foreign', name: 'Stolen' });
    const created = await app.request('/api/channels', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'Stolen', projectId: foreign.id }),
    });
    expect(created.status).toBe(404);
  });

  it('adds a bot participant and a workspace member as a human', async () => {
    const store = new MemoryStore();
    const app = appWith(store);
    const headers = { authorization: `Bearer ${goodToken}`, 'content-type': 'application/json' };
    const other = verifiedPerson('user-2', 'other@example.com', 'Other');
    const outsider = verifiedPerson('user-3', 'outsider@example.com', 'Outsider');
    await store.upsertUser(person, admins);
    await store.upsertUser(other, []);
    await store.upsertUser(outsider, []);
    await store.upsertMembership({ userId: other.id, role: 'member', status: 'active' });
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
      body: JSON.stringify({ agentId: other.id }),
    });
    expect(human.status).toBe(201);
    const refused = await app.request(`/api/channels/${defaultChannel}/participants`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ agentId: outsider.id }),
    });
    expect(refused.status).toBe(403);
    const removed = await app.request(
      `/api/channels/${defaultChannel}/participants/${profile.agent.id}`,
      { method: 'DELETE', headers },
    );
    expect(removed.status).toBe(200);
    const roster = (await (
      await app.request(`/api/channels/${defaultChannel}/participants`, { headers })
    ).json()) as { participants: Array<{ principalId: string }> };
    expect(roster.participants.some((row) => row.principalId === profile.agent.id)).toBe(false);
    expect(roster.participants.some((row) => row.principalId === other.id)).toBe(true);
  });

  it('archives a channel so it is omitted from the list', async () => {
    const store = new MemoryStore();
    const app = appWith(store);
    const headers = { authorization: `Bearer ${goodToken}`, 'content-type': 'application/json' };
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

  it('disables routines on a channel when it is archived', async () => {
    const store = new MemoryStore();
    const app = appWith(store);
    const headers = { authorization: `Bearer ${goodToken}`, 'content-type': 'application/json' };
    const created = await app.request('/api/channels', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'Ops' }),
    });
    const channel = (await created.json()) as { channel: { id: string } };
    await store.createRoutine({
      ownerUserId: person.id,
      agentId: 'general-assistant',
      channelId: channel.channel.id,
      instruction: 'check the queue',
      cron: '0 9 * * *',
      nextRunAt: new Date(Date.now() - 60_000),
    });
    expect(await store.listDueRoutines(new Date())).toHaveLength(1);
    const archived = await app.request(`/api/channels/${channel.channel.id}/archive`, {
      method: 'POST',
      headers,
    });
    expect(archived.status).toBe(200);
    expect(await store.listDueRoutines(new Date())).toHaveLength(0);
    const routines = await store.listRoutinesFor(person.id);
    expect(routines.every((row) => !row.enabled)).toBe(true);
  });

  it('does not restore a removed default bot after upsertUser or getUser', async () => {
    const store = new MemoryStore();
    const app = appWith(store);
    const headers = { authorization: `Bearer ${goodToken}`, 'content-type': 'application/json' };
    const removed = await app.request(`/api/channels/${defaultChannel}/participants/coder`, {
      method: 'DELETE',
      headers,
    });
    expect(removed.status).toBe(200);
    await store.upsertUser(person, admins);
    await store.getUser(person.id);
    const roster = (await (
      await app.request(`/api/channels/${defaultChannel}/participants`, { headers })
    ).json()) as { participants: Array<{ principalId: string }> };
    expect(roster.participants.some((row) => row.principalId === 'coder')).toBe(false);
  });

  it('refuses to archive the default General channel', async () => {
    const store = new MemoryStore();
    const app = appWith(store);
    const headers = { authorization: `Bearer ${goodToken}`, 'content-type': 'application/json' };
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

  it('keeps a single workspace after a second upsert', async () => {
    const store = new MemoryStore();
    await store.upsertUser(person, admins);
    await store.upsertUser(person, admins);
    await store.upsertUser(verifiedPerson('user-2', 'other@example.com', 'Other'), []);
    const first = await store.getWorkspaceForUser(person.id);
    const second = await store.getWorkspaceForUser('user-2');
    expect(first?.id).toBe(DEFAULT_WORKSPACE_ID);
    expect(second).toBeNull();
    expect(first?.ownerUserId).toBe(person.id);
    const extra = await store.createProject({ workspaceId: first?.id ?? '', name: 'Ops' });
    const after = await store.getWorkspaceForUser(person.id);
    expect(after?.projectId).not.toBe(extra.id);
    expect(after?.projectId).toBe(first?.projectId);
  });

  it('does not share membership with a second backend workspace', async () => {
    const engineering = new MemoryStore({ workspaceId: 'ws-eng' });
    const payments = new MemoryStore({ workspaceId: 'ws-pay' });
    await engineering.upsertUser(person, admins);
    const other = verifiedPerson('user-2', 'other@example.com', 'Other');
    await engineering.upsertUser(other, []);
    await engineering.upsertMembership({ userId: other.id, role: 'member', status: 'active' });
    await payments.upsertUser(person, admins);
    await payments.upsertUser(other, []);
    expect((await engineering.getWorkspaceForUser(other.id))?.id).toBe('ws-eng');
    expect(await payments.getWorkspaceForUser(other.id)).toBeNull();
    expect((await payments.getWorkspaceForUser(person.id))?.id).toBe('ws-pay');
    expect((await engineering.getMembership(other.id))?.role).toBe('member');
    expect(await payments.getMembership(other.id)).toBeNull();
  });

  it('lists and assigns membership through admin routes', async () => {
    const store = new MemoryStore();
    const app = appWith(store);
    const headers = { authorization: `Bearer ${goodToken}`, 'content-type': 'application/json' };
    const other = verifiedPerson('user-2', 'other@example.com', 'Other');
    await store.upsertUser(person, admins);
    await store.upsertUser(other, []);
    const assigned = await app.request('/api/admin/memberships', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ userId: other.id, role: 'auditor' }),
    });
    expect(assigned.status).toBe(200);
    const listed = await app.request('/api/admin/memberships', { headers });
    expect(listed.status).toBe(200);
    const body = (await listed.json()) as {
      memberships: Array<{ role: string; userId: string }>;
    };
    expect(body.memberships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: person.id, role: 'admin' }),
        expect.objectContaining({ userId: other.id, role: 'auditor' }),
      ]),
    );
  });

  it('lets two members load channels they participate in', async () => {
    const store = new MemoryStore();
    const app = appWith(store);
    const other = verifiedPerson('user-2', 'other@example.com', 'Other');
    await store.upsertUser(person, admins);
    await store.upsertUser(other, []);
    await store.upsertMembership({ userId: other.id, role: 'member', status: 'active' });
    const memberToken = peopleAuth.mintIdToken({
      subject: other.id,
      email: other.email,
      name: other.name,
    });
    const adminListed = await app.request('/api/channels', {
      headers: { authorization: `Bearer ${goodToken}` },
    });
    const memberListed = await app.request('/api/channels', {
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(adminListed.status).toBe(200);
    expect(memberListed.status).toBe(200);
    const adminBody = (await adminListed.json()) as { channels: Array<{ id: string }> };
    const memberBody = (await memberListed.json()) as { channels: Array<{ id: string }> };
    expect(adminBody.channels.some((row) => row.id === defaultChannel)).toBe(true);
    expect(memberBody.channels.some((row) => row.id === defaultChannel)).toBe(true);
  });
});

async function drainRuns(deps: {
  agent: ReturnType<typeof createScriptedAgentRunner>;
  mcpUrl: string;
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
