import {
  asRecord,
  asString,
  COMPUTER_NAVIGATE,
  COMPUTER_SCREENSHOT,
  matchesToken,
  mcpCapabilityForRef,
  PROVIDER_MOCK_MCP,
} from '@gabot/common';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { requireUser } from './auth.js';
import { runGatewayAction } from './gateway.js';
import { getPluginDetail, listPluginViews } from './plugin-views.js';
import {
  PROTECTED_AGENT_ID,
  PROJECT_NOT_FOUND,
  WORKSPACE_NOT_FOUND,
  type ChannelRecord,
  type GabotStore,
  type SessionUser,
  type WorkspaceRecord,
} from './store/types.js';
import { executeRun, executeTurn, isTurnClientError } from './turns.js';

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
const API_PROJECTS = '/api/projects';
const API_ROUTINES = '/api/routines';
const API_SKILLS = '/api/skills';
const NOT_FOUND = 'Not found';
const UNAUTHORIZED = 'Unauthorized';
const INVALID_BODY = 'Invalid body';
const FORBIDDEN = 'Forbidden';
const HUMANS_FORBIDDEN = 'Cannot add humans as channel participants';
const WORKER_SECRET_HEADER = 'x-gabot-worker-secret';

export function createApiApp(options: ApiOptions): Hono<{ Variables: AuthVariables }> {
  const app = new Hono<{ Variables: AuthVariables }>();
  app.use('*', cors());
  app.get('/health', (context) => context.json({ status: 'ok', plane: 'control' }));

  const auth = requireUser(options.peopleAuth, options.store, options.adminEmails);
  app.use('/api/me', auth);
  app.use(API_CHANNELS, auth);
  app.use(`${API_CHANNELS}/*`, auth);
  app.use(API_PROJECTS, auth);
  app.use(`${API_PROJECTS}/*`, auth);
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
    try {
      const channel = await options.store.createChannel({
        name,
        userId: user.id,
        agentId: asString(body.agentId) || BOT,
        projectId: asString(body.projectId) || undefined,
        description: asString(body.description) || undefined,
      });
      return context.json({ channel }, 201);
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message === PROJECT_NOT_FOUND || error.message === WORKSPACE_NOT_FOUND)
      ) {
        return context.json({ error: NOT_FOUND }, 404);
      }
      throw error;
    }
  });
  registerChannelMutationRoutes(app, options);
  app.post('/api/channels/:id/turns', async (context) => {
    const user = context.get('user');
    const channelId = context.req.param('id');
    const channel = await options.store.getChannel(channelId, user.id);
    if (!channel) {
      return context.json({ error: NOT_FOUND }, 404);
    }
    const body = asRecord(await context.req.json());
    try {
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return context.json({ error: message }, isTurnClientError(error) ? 400 : 500);
    }
  });
  app.get('/api/admin/audit-events', async (context) => {
    const user = context.get('user');
    const workspace = await options.store.getWorkspaceForUser(user.id);
    const limit = Number(context.req.query('limit') ?? '25');
    return context.json({
      events: await options.store.listAudit(Number.isFinite(limit) ? limit : 25, {
        actorUserId: user.id,
        workspaceId: workspace?.id ?? '',
      }),
    });
  });
}

function registerChannelMutationRoutes(
  app: Hono<{ Variables: AuthVariables }>,
  options: ApiOptions,
): void {
  app.patch('/api/channels/:id', async (context) => {
    const owned = await requireOwnedChannel(
      options.store,
      context.get('user'),
      context.req.param('id'),
    );
    if (!owned.ok) {
      return context.json(owned.body, owned.status);
    }
    const body = asRecord(await context.req.json());
    const channel = await options.store.updateChannel(owned.channel.id, {
      description: asString(body.description) || undefined,
    });
    if (!channel) {
      return context.json({ error: NOT_FOUND }, 404);
    }
    return context.json({ channel });
  });
  app.post('/api/channels/:id/archive', async (context) => {
    const owned = await requireOwnedChannel(
      options.store,
      context.get('user'),
      context.req.param('id'),
    );
    if (!owned.ok) {
      return context.json(owned.body, owned.status);
    }
    await options.store.archiveChannel(owned.channel.id);
    return context.json({ ok: true });
  });
  app.post('/api/channels/:id/participants', async (context) => {
    const owned = await requireOwnedChannel(
      options.store,
      context.get('user'),
      context.req.param('id'),
    );
    if (!owned.ok) {
      return context.json(owned.body, owned.status);
    }
    const agentId = asString(asRecord(await context.req.json()).agentId);
    if (!agentId) {
      return context.json({ error: INVALID_BODY }, 400);
    }
    const allowed = await botParticipantOrError(options.store, agentId);
    if (!allowed.ok) {
      return context.json(allowed.body, allowed.status);
    }
    await options.store.addChannelParticipant({
      channelId: owned.channel.id,
      principalType: 'bot',
      principalId: agentId,
      role: 'bot',
    });
    return context.json(
      {
        participant: {
          channelId: owned.channel.id,
          principalType: 'bot',
          principalId: agentId,
          role: 'bot',
        },
      },
      201,
    );
  });
  app.delete('/api/channels/:id/participants/:agentId', async (context) => {
    const owned = await requireOwnedChannel(
      options.store,
      context.get('user'),
      context.req.param('id'),
    );
    if (!owned.ok) {
      return context.json(owned.body, owned.status);
    }
    const agentId = context.req.param('agentId');
    const allowed = await botParticipantOrError(options.store, agentId);
    if (!allowed.ok) {
      return context.json(allowed.body, allowed.status);
    }
    const removed = await options.store.removeChannelParticipant({
      channelId: owned.channel.id,
      principalType: 'bot',
      principalId: agentId,
    });
    if (!removed) {
      return context.json({ error: NOT_FOUND }, 404);
    }
    return context.json({ ok: true });
  });
  app.get('/api/channels/:id/policies', async (context) => {
    const owned = await requireOwnedChannel(
      options.store,
      context.get('user'),
      context.req.param('id'),
    );
    if (!owned.ok) {
      return context.json(owned.body, owned.status);
    }
    return context.json({ policies: await options.store.listChannelPolicies(owned.channel.id) });
  });
  app.put('/api/channels/:id/policies', async (context) => {
    const owned = await requireOwnedChannel(
      options.store,
      context.get('user'),
      context.req.param('id'),
    );
    if (!owned.ok) {
      return context.json(owned.body, owned.status);
    }
    const policies = readChannelPolicies(await context.req.json());
    if (!policies) {
      return context.json({ error: INVALID_BODY }, 400);
    }
    const saved = await options.store.replaceChannelPolicies(owned.channel.id, policies);
    return context.json({ policies: saved });
  });
}

function registerProductRoutes(app: Hono<{ Variables: AuthVariables }>, options: ApiOptions): void {
  app.get(API_PROJECTS, async (context) => {
    const workspace = await options.store.getWorkspaceForUser(context.get('user').id);
    if (!workspace) {
      return context.json({ error: NOT_FOUND }, 404);
    }
    return context.json({ projects: await options.store.listProjects(workspace.id) });
  });
  app.post(API_PROJECTS, async (context) => {
    const workspace = await options.store.getWorkspaceForUser(context.get('user').id);
    if (!workspace) {
      return context.json({ error: NOT_FOUND }, 404);
    }
    const name = asString(asRecord(await context.req.json()).name);
    if (!name) {
      return context.json({ error: 'name is required' }, 400);
    }
    const project = await options.store.createProject({ workspaceId: workspace.id, name });
    return context.json({ project }, 201);
  });
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
  app.get('/api/admin/connections', async (context) => {
    const access = await requireAdminWorkspace(options.store, context.get('user'));
    if (!access.ok) {
      return context.json(access.body, access.status);
    }
    const connections = await options.store.listOwnerConnections(access.workspace.id);
    return context.json({ connections });
  });
  app.put('/api/admin/capability-grants', async (context) => {
    const outcome = await writeCapabilityGrant(
      options.store,
      context.get('user'),
      asRecord(await context.req.json()),
    );
    return context.json(outcome.body, outcome.status);
  });
  app.get('/api/admin/plugins', async (context) => {
    const workspace = await options.store.getWorkspaceForUser(context.get('user').id);
    if (!workspace) {
      return context.json({ error: NOT_FOUND }, 404);
    }
    return context.json({ plugins: await listPluginViews(options.store, workspace) });
  });
  app.get('/api/admin/plugins/:id', async (context) => {
    const workspace = await options.store.getWorkspaceForUser(context.get('user').id);
    if (!workspace) {
      return context.json({ error: NOT_FOUND }, 404);
    }
    const detail = await getPluginDetail(options.store, context.req.param('id'), workspace);
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

async function writeCapabilityGrant(
  store: GabotStore,
  user: SessionUser,
  body: Record<string, unknown>,
): Promise<{ body: Record<string, unknown>; status: 200 | 400 | 403 | 404 }> {
  const access = await requireAdminWorkspace(store, user);
  if (!access.ok) {
    return access;
  }
  const provider = asString(body.provider);
  const capability = asString(body.capability);
  const resource = asString(body.resource);
  if (!provider || !capability || !resource) {
    return { status: 400, body: { error: 'Invalid grant' } };
  }
  const granted = body.granted !== false;
  return persistCapabilityGrant(store, user, access.workspace, {
    provider,
    capability,
    resource,
    granted,
    eventType: granted ? 'capability.granted' : 'capability.revoked',
    targetId: resource,
  });
}

async function writePluginGrant(
  store: GabotStore,
  user: SessionUser,
  pluginId: string,
  body: Record<string, unknown>,
): Promise<{ body: Record<string, unknown>; status: 200 | 400 | 403 | 404 }> {
  const access = await requireAdminWorkspace(store, user);
  if (!access.ok) {
    return access;
  }
  const detail = await getPluginDetail(store, pluginId, access.workspace);
  if (!detail) {
    return { status: 404, body: { error: NOT_FOUND } };
  }
  const ref = asString(body.ref);
  const granted = body.granted !== false;
  if (!detail.tools.some((tool) => tool.ref === ref)) {
    return { status: 400, body: { error: 'Invalid grant' } };
  }
  return persistCapabilityGrant(store, user, access.workspace, {
    provider: PROVIDER_MOCK_MCP,
    capability: mcpCapabilityForRef(ref),
    resource: ref,
    granted,
    eventType: granted ? 'plugin.granted' : 'plugin.revoked',
    targetId: ref,
    extraPayload: { ref },
  });
}

async function requireAdminWorkspace(
  store: GabotStore,
  user: SessionUser,
): Promise<
  | { ok: true; workspace: WorkspaceRecord }
  | { body: Record<string, unknown>; ok: false; status: 403 | 404 }
> {
  if (!user.isAdmin) {
    return { ok: false, status: 403, body: { error: FORBIDDEN } };
  }
  const workspace = await store.getWorkspaceForUser(user.id);
  if (!workspace) {
    return { ok: false, status: 404, body: { error: NOT_FOUND } };
  }
  return { ok: true, workspace };
}

async function persistCapabilityGrant(
  store: GabotStore,
  user: SessionUser,
  workspace: WorkspaceRecord,
  input: {
    capability: string;
    eventType: string;
    extraPayload?: Record<string, unknown>;
    granted: boolean;
    provider: string;
    resource: string;
    targetId: string;
  },
): Promise<{ body: Record<string, unknown>; status: 200 | 404 }> {
  try {
    await store.setCapabilityGrant({
      workspaceId: workspace.id,
      ownerUserId: workspace.ownerUserId,
      provider: input.provider,
      capability: input.capability,
      resource: input.resource,
      granted: input.granted,
      grantedBy: user.id,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Connection not found.') {
      return { status: 404, body: { error: NOT_FOUND } };
    }
    throw error;
  }
  await store.insertAudit({
    actorUserId: user.id,
    eventType: input.eventType,
    targetType: 'grant',
    targetId: input.targetId,
    payload: {
      ...input.extraPayload,
      provider: input.provider,
      capability: input.capability,
      resource: input.resource,
      granted: input.granted,
      workspaceId: workspace.id,
      ownerUserId: workspace.ownerUserId,
    },
  });
  return { status: 200, body: { ok: true, granted: input.granted } };
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
      return context.json({ error: FORBIDDEN }, 403);
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
    const channel = await options.store.getChannel(channelId, owner.id);
    if (!channel) {
      return context.json({ error: NOT_FOUND }, 404);
    }
    const result = await executeTurn({
      store: options.store,
      sandbox: options.sandbox,
      agent: options.agent,
      mcpUrl: options.mcpUrl,
      user: owner,
      channelId: channel.id,
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
      run,
    });
    return context.json({ ok: true, text: result.text, runId: result.runId });
  });
}

function matchesWorker(offered: string | undefined, expected: string): boolean {
  return Boolean(expected) && matchesToken(expected, offered ?? '');
}

async function requireOwnedChannel(
  store: GabotStore,
  user: SessionUser,
  channelId: string,
): Promise<
  | { channel: ChannelRecord; ok: true }
  | { body: Record<string, unknown>; ok: false; status: 403 | 404 }
> {
  const channel = await store.getChannel(channelId, user.id);
  if (!channel) {
    return { ok: false, status: 404, body: { error: NOT_FOUND } };
  }
  const scope = await store.getChannelScope(channelId);
  if (!scope || scope.ownerUserId !== user.id) {
    return { ok: false, status: 403, body: { error: FORBIDDEN } };
  }
  return { ok: true, channel };
}

async function botParticipantOrError(
  store: GabotStore,
  agentId: string,
): Promise<{ body: Record<string, unknown>; ok: false; status: 403 | 404 } | { ok: true }> {
  const [person, agents] = await Promise.all([store.getUser(agentId), store.listAgents()]);
  const agent = agents.find((row) => row.id === agentId);
  if (person && !agent) {
    return { ok: false, status: 403, body: { error: HUMANS_FORBIDDEN } };
  }
  if (!agent) {
    return { ok: false, status: 404, body: { error: NOT_FOUND } };
  }
  return { ok: true };
}

function readChannelPolicies(
  value: unknown,
): Array<{ capability: string; resource: string }> | null {
  const record = asRecord(value);
  if (!Array.isArray(record.policies)) {
    return null;
  }
  const policies: Array<{ capability: string; resource: string }> = [];
  for (const item of record.policies) {
    const row = asRecord(item);
    const capability = asString(row.capability);
    const resource = asString(row.resource);
    if (!capability || !resource) {
      return null;
    }
    policies.push({ capability, resource });
  }
  return policies;
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
