import {
  asRecord,
  asString,
  COMPUTER_NAVIGATE,
  COMPUTER_SCREENSHOT,
  matchesToken,
} from '@gabot/common';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { requireUser } from './auth.js';
import { runGatewayAction } from './gateway.js';
import { getPluginDetail, listPluginViews } from './plugin-views.js';
import { PROTECTED_AGENT_ID, type GabotStore, type SessionUser } from './store/types.js';
import { executeRun, executeTurn } from './turns.js';

import type { AuthVariables } from './auth.js';
import type { AgentRunner } from './turns.js';
import type {
  ActionPolicy,
  ComputerActionResult,
  PeopleAuthPort,
  SandboxPort,
} from '@gabot/common';

type ApiOptions = {
  store: GabotStore;
  peopleAuth: PeopleAuthPort;
  sandbox: SandboxPort;
  agent: AgentRunner;
  mcpUrl: string;
  workerSecret: string;
  adminEmails: string[];
};

const BOT = PROTECTED_AGENT_ID;
const API_AGENTS = '/api/agents';
const API_CHANNELS = '/api/channels';
const API_ROUTINES = '/api/routines';
const API_SKILLS = '/api/skills';
const NOT_FOUND = 'Not found';
const UNAUTHORIZED = 'Unauthorized';
const INVALID_BODY = 'Invalid body';
const WORKER_SECRET_HEADER = 'x-gabot-worker-secret';

export function createApiApp(options: ApiOptions): Hono<{ Variables: AuthVariables }> {
  const app = new Hono<{ Variables: AuthVariables }>();
  app.use('*', cors());
  app.get('/health', (context) => context.json({ status: 'ok', plane: 'control' }));

  const auth = requireUser(options.peopleAuth, options.store, options.adminEmails);
  app.use('/api/me', auth);
  app.use(API_CHANNELS, auth);
  app.use(`${API_CHANNELS}/*`, auth);
  app.use('/api/computers', auth);
  app.use('/api/computers/*', auth);
  app.use('/api/admin/*', auth);
  app.use(API_AGENTS, auth);
  app.use(`${API_AGENTS}/*`, auth);
  app.use(API_ROUTINES, auth);
  app.use(`${API_ROUTINES}/*`, auth);
  app.use(API_SKILLS, auth);
  app.use(`${API_SKILLS}/*`, auth);

  registerSessionRoutes(app, options);
  registerProductRoutes(app, options);
  registerComputerRoutes(app, options);
  registerInternalRoutes(app, options);
  return app;
}

function registerSessionRoutes(app: Hono<{ Variables: AuthVariables }>, options: ApiOptions): void {
  app.get('/api/me', (context) => context.json(context.get('user')));
  app.get(API_CHANNELS, async (context) => {
    const user = context.get('user');
    return context.json({ channels: await options.store.listChannels(user.id) });
  });
  app.get('/api/channels/:id/messages', async (context) => {
    const user = context.get('user');
    const channelId = context.req.param('id');
    const channel = await options.store.getChannel(channelId, user.id);
    if (!channel) {
      return context.json({ error: NOT_FOUND }, 404);
    }
    return context.json({ messages: await options.store.listMessages(channelId) });
  });
  app.get('/api/channels/:id/participants', async (context) => {
    const user = context.get('user');
    const channelId = context.req.param('id');
    const channel = await options.store.getChannel(channelId, user.id);
    if (!channel) {
      return context.json({ error: NOT_FOUND }, 404);
    }
    return context.json({ participants: await options.store.listChannelParticipants(channelId) });
  });
  app.get('/api/channels/:id/events', async (context) => {
    const user = context.get('user');
    const channelId = context.req.param('id');
    const channel = await options.store.getChannel(channelId, user.id);
    if (!channel) {
      return context.json({ error: NOT_FOUND }, 404);
    }
    return context.json({ events: await options.store.listChannelEvents(channelId) });
  });
  app.post(API_CHANNELS, async (context) => {
    const user = context.get('user');
    const body = asRecord(await context.req.json());
    const name = asString(body.name) || 'New channel';
    const channel = await options.store.createChannel({
      name,
      userId: user.id,
      agentId: asString(body.agentId) || BOT,
    });
    return context.json({ channel }, 201);
  });
  app.post('/api/channels/:id/turns', async (context) => {
    const user = context.get('user');
    const channelId = context.req.param('id');
    const channel = await options.store.getChannel(channelId, user.id);
    if (!channel) {
      return context.json({ error: NOT_FOUND }, 404);
    }
    const body = asRecord(await context.req.json());
    const result = await executeTurn({
      store: options.store,
      sandbox: options.sandbox,
      agent: options.agent,
      mcpUrl: options.mcpUrl,
      user,
      channelId,
      message: asString(body.message),
      botId: asString(body.botId) || undefined,
    });
    const payload = `data: ${JSON.stringify({ type: 'text', delta: result.text, toolNames: result.toolNames })}\n\ndata: ${JSON.stringify({ type: 'done' })}\n\n`;
    return context.body(payload, 200, { 'content-type': 'text/event-stream' });
  });
  app.get('/api/admin/audit-events', async (context) => {
    const limit = Number(context.req.query('limit') ?? '25');
    return context.json({
      events: await options.store.listAudit(Number.isFinite(limit) ? limit : 25),
    });
  });
}

function registerProductRoutes(app: Hono<{ Variables: AuthVariables }>, options: ApiOptions): void {
  app.get(API_AGENTS, async (context) => {
    return context.json({ agents: await options.store.listAgents() });
  });
  app.post(API_AGENTS, async (context) => {
    const body = asRecord(await context.req.json());
    const name = asString(body.name);
    if (!name) {
      return context.json({ error: 'name is required' }, 400);
    }
    const agent = await options.store.createAgent({
      name,
      title: asString(body.title) || name,
      roleDescription: asString(body.roleDescription) || 'A coworker.',
      visibility: asString(body.visibility) || 'public',
    });
    return context.json({ agent }, 201);
  });
  app.patch(`${API_AGENTS}/:id`, async (context) => {
    const body = asRecord(await context.req.json());
    const agent = await options.store.updateAgent(context.req.param('id'), {
      name: asString(body.name) || undefined,
      title: asString(body.title) || undefined,
      roleDescription: asString(body.roleDescription) || undefined,
      visibility: asString(body.visibility) || undefined,
    });
    if (!agent) {
      return context.json({ error: NOT_FOUND }, 404);
    }
    await options.store.insertAudit({
      actorUserId: context.get('user').id,
      eventType: 'agent.updated',
      targetType: 'agent',
      targetId: agent.id,
      payload: { name: agent.name },
    });
    return context.json({ agent });
  });
  app.delete(`${API_AGENTS}/:id`, async (context) => {
    const id = context.req.param('id');
    if (id === PROTECTED_AGENT_ID) {
      return context.json({ error: 'Cannot delete the general assistant' }, 409);
    }
    const removed = await options.store.deleteAgent(id);
    if (!removed) {
      return context.json({ error: NOT_FOUND }, 404);
    }
    await options.store.insertAudit({
      actorUserId: context.get('user').id,
      eventType: 'agent.deleted',
      targetType: 'agent',
      targetId: id,
      payload: {},
    });
    return context.json({ ok: true });
  });
  app.get(API_SKILLS, async (context) => {
    return context.json({ skills: await options.store.listSkills() });
  });
  app.post(API_SKILLS, async (context) => {
    const body = asRecord(await context.req.json());
    const slug = asString(body.slug);
    const title = asString(body.title);
    const instructions = asString(body.instructions);
    if (!slug || !title || !instructions) {
      return context.json({ error: 'slug, title, and instructions are required' }, 400);
    }
    if (!SKILL_SLUG_RE.test(slug)) {
      return context.json({ error: 'invalid slug' }, 400);
    }
    const skill = await options.store.upsertSkill({
      slug,
      title,
      summary: asString(body.summary) || title,
      instructions,
    });
    await options.store.insertAudit({
      actorUserId: context.get('user').id,
      eventType: 'skill.upserted',
      targetType: 'skill',
      targetId: skill.id,
      payload: { slug: skill.slug },
    });
    return context.json({ skill });
  });
  app.delete(`${API_SKILLS}/:slug`, async (context) => {
    const slug = context.req.param('slug');
    const removed = await options.store.deleteSkill(slug);
    if (!removed) {
      return context.json({ error: NOT_FOUND }, 404);
    }
    await options.store.insertAudit({
      actorUserId: context.get('user').id,
      eventType: 'skill.deleted',
      targetType: 'skill',
      targetId: slug,
      payload: { slug },
    });
    return context.json({ ok: true });
  });
  app.get('/api/admin/people', async (context) => {
    return context.json({ people: await options.store.listPeople() });
  });
  app.get(`${API_AGENTS}/:id`, async (context) => {
    const agents = await options.store.listAgents();
    const agent = agents.find((row) => row.id === context.req.param('id'));
    if (!agent) {
      return context.json({ error: NOT_FOUND }, 404);
    }
    return context.json({ agent });
  });
  registerPluginRoutes(app, options);
  app.get(API_ROUTINES, async (context) => {
    const user = context.get('user');
    return context.json({ routines: await options.store.listRoutinesFor(user.id) });
  });
  app.put(`${API_ROUTINES}/:id/enabled`, async (context) => {
    const user = context.get('user');
    const body = asRecord(await context.req.json());
    const routine = await options.store.setRoutineEnabled(
      context.req.param('id'),
      user.id,
      body.enabled !== false,
    );
    if (!routine) {
      return context.json({ error: NOT_FOUND }, 404);
    }
    return context.json({ routine });
  });
  app.delete(`${API_ROUTINES}/:id`, async (context) => {
    const user = context.get('user');
    const removed = await options.store.deleteRoutine(context.req.param('id'), user.id);
    if (!removed) {
      return context.json({ error: NOT_FOUND }, 404);
    }
    return context.json({ ok: true });
  });
}

const SKILL_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/;

function registerPluginRoutes(app: Hono<{ Variables: AuthVariables }>, options: ApiOptions): void {
  app.get('/api/admin/plugins', async (context) => {
    return context.json({ plugins: await listPluginViews(options.store) });
  });
  app.get('/api/admin/plugins/:id', async (context) => {
    const detail = await getPluginDetail(options.store, context.req.param('id'));
    if (!detail) {
      return context.json({ error: NOT_FOUND }, 404);
    }
    return context.json(detail);
  });
  app.put('/api/admin/plugins/:id/grants', async (context) => {
    const outcome = await writePluginGrant(
      options.store,
      context.get('user'),
      context.req.param('id'),
      asRecord(await context.req.json()),
    );
    return context.json(outcome.body, outcome.status);
  });
}

async function writePluginGrant(
  store: GabotStore,
  user: SessionUser,
  pluginId: string,
  body: Record<string, unknown>,
): Promise<{ body: Record<string, unknown>; status: 200 | 400 | 403 | 404 }> {
  if (!user.isAdmin) {
    return { status: 403, body: { error: 'Forbidden' } };
  }
  const detail = await getPluginDetail(store, pluginId);
  if (!detail) {
    return { status: 404, body: { error: NOT_FOUND } };
  }
  const agentId = asString(body.agentId);
  const ref = asString(body.ref);
  const granted = body.granted !== false;
  const knownAgent = detail.agents.some((agent) => agent.id === agentId);
  const knownTool = detail.tools.some((tool) => tool.ref === ref);
  if (!knownAgent || !knownTool) {
    return { status: 400, body: { error: 'Invalid grant' } };
  }
  await store.setGrant({
    kind: 'mcp',
    ref,
    agentId,
    granted,
    grantedBy: user.id,
  });
  await store.insertAudit({
    actorUserId: user.id,
    eventType: granted ? 'plugin.granted' : 'plugin.revoked',
    targetType: 'grant',
    targetId: ref,
    payload: { agentId, ref, granted },
  });
  return { status: 200, body: { ok: true, granted } };
}

function registerComputerRoutes(
  app: Hono<{ Variables: AuthVariables }>,
  options: ApiOptions,
): void {
  app.get('/api/computers', async (context) => {
    const agents = await options.store.listAgents();
    return context.json({
      computers: agents.map((agent) => ({ id: agent.id, name: agent.title })),
    });
  });
  app.get('/api/computers/policy', async (context) => {
    return context.json({ policy: await options.store.getPolicy() });
  });
  app.put('/api/computers/policy', async (context) => {
    const user = context.get('user');
    if (!user.isAdmin) {
      return context.json({ error: 'Forbidden' }, 403);
    }
    const policy = readPolicy(await context.req.json());
    await options.store.setPolicy(policy, user.id);
    return context.json({ policy });
  });
  app.get('/api/computers/:botId/screenshot', async (context) => {
    const shot = await liveScreenshot(options.sandbox, context.req.param('botId'));
    return context.json(shot.body, shot.status);
  });
  app.post('/api/computers/:botId/navigate', async (context) => {
    const user = context.get('user');
    const body = asRecord(await context.req.json());
    const result = await runGatewayAction({
      store: options.store,
      sandbox: options.sandbox,
      mcpUrl: options.mcpUrl,
      actorId: user.id,
      botId: context.req.param('botId'),
      toolName: COMPUTER_NAVIGATE,
      args: { url: body.url },
    });
    if (!result.ok) {
      return context.json({ error: result.reason, matched: result.matched }, 403);
    }
    return context.json(result.result ?? { ok: true, url: asString(body.url) });
  });
  app.post('/api/computers/:botId/screenshot', async (context) => {
    const user = context.get('user');
    const result = await runGatewayAction({
      store: options.store,
      sandbox: options.sandbox,
      mcpUrl: options.mcpUrl,
      actorId: user.id,
      botId: context.req.param('botId'),
      toolName: COMPUTER_SCREENSHOT,
      args: {},
    });
    if (!result.ok) {
      return context.json({ error: result.reason }, 403);
    }
    return context.json(result.result ?? { ok: true });
  });
}

async function liveScreenshot(
  sandbox: SandboxPort,
  botId: string,
): Promise<{ body: ComputerActionResult | { error: string }; status: 200 | 502 }> {
  const result = await sandbox.screenshot(botId);
  if (!result.ok) {
    return { status: 502, body: { error: result.error ?? 'unavailable' } };
  }
  return { status: 200, body: result };
}

function registerInternalRoutes(
  app: Hono<{ Variables: AuthVariables }>,
  options: ApiOptions,
): void {
  app.post('/api/internal/handoff', async (context) => {
    if (!matchesWorker(context.req.header(WORKER_SECRET_HEADER), options.workerSecret)) {
      return context.json({ error: UNAUTHORIZED }, 401);
    }
    const body = asRecord(await context.req.json());
    const channelId = asString(body.channelId);
    const text = asString(body.text);
    if (!channelId || !text) {
      return context.json({ error: INVALID_BODY }, 400);
    }
    await options.store.appendMessage({
      channelId,
      role: 'assistant',
      content: text,
      agentId: BOT,
    });
    return context.json({ ok: true });
  });
  app.post('/api/internal/routines/run', async (context) => {
    if (!matchesWorker(context.req.header(WORKER_SECRET_HEADER), options.workerSecret)) {
      return context.json({ error: UNAUTHORIZED }, 401);
    }
    const body = asRecord(await context.req.json());
    const channelId = asString(body.channelId);
    const instruction = asString(body.instruction);
    const ownerUserId = asString(body.ownerUserId);
    const agentId = asString(body.agentId) || BOT;
    const owner = await options.store.getUser(ownerUserId);
    if (!channelId || !instruction || !owner) {
      return context.json({ error: INVALID_BODY }, 400);
    }
    const result = await executeTurn({
      store: options.store,
      sandbox: options.sandbox,
      agent: options.agent,
      mcpUrl: options.mcpUrl,
      user: owner,
      channelId,
      message: instruction,
      botId: agentId,
    });
    return context.json({ ok: true, text: result.text });
  });
  app.post('/api/internal/runs/execute', async (context) => {
    if (!matchesWorker(context.req.header(WORKER_SECRET_HEADER), options.workerSecret)) {
      return context.json({ error: UNAUTHORIZED }, 401);
    }
    const body = asRecord(await context.req.json());
    const runId = asString(body.runId);
    const run = await options.store.getRun(runId);
    if (!run) {
      return context.json({ error: INVALID_BODY }, 400);
    }
    const owner = await options.store.getUser(run.ownerUserId);
    if (!owner) {
      return context.json({ error: INVALID_BODY }, 400);
    }
    const result = await executeRun({
      store: options.store,
      sandbox: options.sandbox,
      agent: options.agent,
      mcpUrl: options.mcpUrl,
      user: owner,
      runId,
    });
    return context.json({ ok: true, text: result.text, runId: result.runId });
  });
}

function matchesWorker(offered: string | undefined, expected: string): boolean {
  return Boolean(expected) && matchesToken(expected, offered ?? '');
}

function readPolicy(value: unknown): ActionPolicy {
  const record = asRecord(value);
  return {
    mode: record.mode === 'dry-run' ? 'dry-run' : 'enforce',
    deny: Array.isArray(record.deny) ? record.deny.filter((item) => typeof item === 'string') : [],
    allow: Array.isArray(record.allow)
      ? record.allow.filter((item) => typeof item === 'string')
      : [],
  };
}
