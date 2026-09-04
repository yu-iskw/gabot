import {
  asStringArray,
  DEFAULT_ALLOW_POLICY,
  DEFAULT_CHANNEL_NAME,
  defaultChannelParticipants,
  nextRoutineRun,
  personalChannelId,
  personalProjectId,
  personalWorkspaceId,
  PLATFORM_ORG_ID,
} from '@gabot/common';
import postgres from 'postgres';

import { insertDelegatedChild } from './postgres-delegation.js';
import { parseEnvelope, toRunRecord, type DbRun } from './postgres-run-map.js';
import { PROTECTED_AGENT_ID } from './types.js';

import type {
  AgentPatch,
  AgentProfile,
  AuditListScope,
  AuditRecord,
  ChannelEventRecord,
  ChannelParticipant,
  ChannelRecord,
  ChannelScope,
  DelegatedChildInput,
  DelegationRecord,
  GabotStore,
  GrantRecord,
  MessageRecord,
  PluginRecord,
  PluginTool,
  RoutineListItem,
  RoutinePatch,
  RoutineRecord,
  RunRecord,
  RunStatus,
  SessionUser,
  SkillRecord,
  WorkRecord,
  WorkspaceRecord,
} from './types.js';
import type { ActionPolicy, AuthorityEnvelope, VerifiedPerson } from '@gabot/common';

type Sql = ReturnType<typeof postgres>;
type QuerySql = postgres.Sql;

export class PostgresStore implements GabotStore {
  public constructor(private readonly sql: Sql) {}

  public async upsertUser(person: VerifiedPerson, adminEmails: string[]): Promise<SessionUser> {
    await this.sql`
      INSERT INTO users (id, email, name)
      VALUES (${person.id}, ${person.email}, ${person.name})
      ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, updated_at = now()
    `;
    const rows = await this.sql<{ id: string; email: string; name: string | null }[]>`
      SELECT id, email, name FROM users WHERE email = ${person.email}
    `;
    const user = rows.at(0);
    if (user === undefined) {
      throw new Error('Failed to upsert user.');
    }
    const isAdmin = adminEmails.includes(person.email.toLowerCase());
    if (isAdmin) {
      await this.sql`
        INSERT INTO user_roles (user_id, role) VALUES (${user.id}, 'admin')
        ON CONFLICT DO NOTHING
      `;
    }
    await this.ensurePersonalWorkspace({
      id: user.id,
      email: user.email,
      name: user.name ?? person.name,
      isAdmin,
    });
    return { id: user.id, email: user.email, name: user.name ?? person.name, isAdmin };
  }

  public async listChannels(userId: string): Promise<ChannelRecord[]> {
    return await this.sql<ChannelRecord[]>`
      SELECT c.id, c.name, c.description, c.last_message AS "lastMessage"
      FROM channels c
      JOIN channel_participants p ON p.channel_id = c.id
      WHERE p.principal_type = 'user' AND p.principal_id = ${userId}
      ORDER BY c.created_at
    `;
  }

  public async getChannel(channelId: string, userId: string): Promise<ChannelRecord | null> {
    const rows = await this.sql<ChannelRecord[]>`
      SELECT c.id, c.name, c.description, c.last_message AS "lastMessage"
      FROM channels c
      JOIN channel_participants p ON p.channel_id = c.id
      WHERE c.id = ${channelId} AND p.principal_type = 'user' AND p.principal_id = ${userId}
    `;
    return rows.at(0) ?? null;
  }

  public async appendMessage(input: {
    channelId: string;
    role: string;
    content: string;
    agentId?: string;
  }): Promise<MessageRecord> {
    const id = crypto.randomUUID();
    const rows = await this.sql<MessageRecord[]>`
      INSERT INTO messages (id, channel_id, role, content, agent_id)
      VALUES (${id}, ${input.channelId}, ${input.role}, ${input.content}, ${input.agentId ?? null})
      RETURNING id, channel_id AS "channelId", role, content, agent_id AS "agentId", created_at AS "createdAt"
    `;
    await this.sql`
      UPDATE channels SET last_message = ${input.content}, last_message_at = now(), updated_at = now()
      WHERE id = ${input.channelId}
    `;
    const record = rows.at(0);
    if (record === undefined) {
      throw new Error('Failed to append message.');
    }
    return record;
  }

  public async listMessages(channelId: string): Promise<MessageRecord[]> {
    return this.sql<MessageRecord[]>`
      SELECT id, channel_id AS "channelId", role, content, agent_id AS "agentId", created_at AS "createdAt"
      FROM messages WHERE channel_id = ${channelId} ORDER BY created_at
    `;
  }

  public async mintThread(userId: string, channelId: string): Promise<string> {
    const threadId = crypto.randomUUID();
    const inserted = await this.sql<{ thread_id: string }[]>`
      INSERT INTO threads (user_id, channel_id, thread_id)
      VALUES (${userId}, ${channelId}, ${threadId})
      ON CONFLICT (user_id, channel_id) DO NOTHING
      RETURNING thread_id
    `;
    const created = inserted.at(0)?.thread_id;
    if (created) {
      return created;
    }
    const existing = await this.sql<{ thread_id: string }[]>`
      SELECT thread_id FROM threads WHERE user_id = ${userId} AND channel_id = ${channelId}
    `;
    return existing.at(0)?.thread_id ?? threadId;
  }

  public async getPolicy(): Promise<ActionPolicy> {
    const rows = await this.sql<{ mode: string; deny: string[]; allow: string[] }[]>`
      SELECT mode, deny, allow FROM action_policy WHERE id = 'current'
    `;
    const row = rows.at(0);
    if (row === undefined) {
      return DEFAULT_ALLOW_POLICY;
    }
    return {
      mode: row.mode === 'dry-run' ? 'dry-run' : 'enforce',
      deny: row.deny,
      allow: row.allow,
    };
  }

  public async setPolicy(policy: ActionPolicy, userId: string): Promise<void> {
    await this.sql`
      INSERT INTO action_policy (id, mode, deny, allow, updated_by)
      VALUES ('current', ${policy.mode}, ${policy.deny}, ${policy.allow}, ${userId})
      ON CONFLICT (id) DO UPDATE SET
        mode = EXCLUDED.mode,
        deny = EXCLUDED.deny,
        allow = EXCLUDED.allow,
        updated_by = EXCLUDED.updated_by,
        updated_at = now()
    `;
  }

  public async insertAudit(input: {
    actorUserId?: string;
    eventType: string;
    targetType: string;
    targetId?: string;
    payload: Record<string, unknown>;
  }): Promise<void> {
    await this.sql`
      INSERT INTO audit_events (actor_user_id, event_type, target_type, target_id, payload)
      VALUES (
        ${input.actorUserId ?? null},
        ${input.eventType},
        ${input.targetType},
        ${input.targetId ?? null},
        ${JSON.stringify(input.payload)}::jsonb
      )
    `;
  }

  public async listAudit(limit: number, scope?: AuditListScope): Promise<AuditRecord[]> {
    if (!scope) {
      return this.sql<AuditRecord[]>`
        SELECT event_type AS "eventType", target_type AS "targetType", target_id AS "targetId",
               payload, created_at AS "createdAt", actor_user_id AS "actorUserId"
        FROM audit_events
        ORDER BY created_at DESC, id DESC
        LIMIT ${limit}
      `;
    }
    return this.sql<AuditRecord[]>`
      SELECT event_type AS "eventType", target_type AS "targetType", target_id AS "targetId",
             payload, created_at AS "createdAt", actor_user_id AS "actorUserId"
      FROM audit_events
      WHERE payload->>'workspaceId' = ${scope.workspaceId}
         OR (
           actor_user_id = ${scope.actorUserId}
           AND COALESCE(payload->>'workspaceId', '') = ''
         )
      ORDER BY created_at DESC, id DESC
      LIMIT ${limit}
    `;
  }

  public async hasGrant(agentId: string, kind: string, ref: string): Promise<boolean> {
    const rows = await this.sql<{ n: string }[]>`
      SELECT 1 AS n FROM plugin_grants
      WHERE agent_id = ${agentId} AND kind = ${kind} AND ref = ${ref}
    `;
    return rows.length > 0;
  }

  public async listGrants(): Promise<GrantRecord[]> {
    return this.sql<GrantRecord[]>`
      SELECT kind, ref, agent_id AS "agentId" FROM plugin_grants
    `;
  }

  public async listPluginTools(serverId: string): Promise<PluginTool[]> {
    const rows = await this.sql<{ name: string; description: string }[]>`
      SELECT name, description FROM mcp_tools WHERE server_id = ${serverId} ORDER BY name
    `;
    return rows.map((row) => ({
      name: row.name,
      description: row.description,
      ref: `${serverId}/${row.name}`,
    }));
  }

  public async setGrant(input: {
    agentId: string;
    granted: boolean;
    grantedBy: string;
    kind: string;
    ref: string;
  }): Promise<void> {
    if (input.granted) {
      await this.sql`
        INSERT INTO plugin_grants (kind, ref, agent_id, granted_by)
        VALUES (${input.kind}, ${input.ref}, ${input.agentId}, ${input.grantedBy})
        ON CONFLICT DO NOTHING
      `;
      return;
    }
    await this.sql`
      DELETE FROM plugin_grants
      WHERE kind = ${input.kind} AND ref = ${input.ref} AND agent_id = ${input.agentId}
    `;
  }

  public async enqueueWork(input: {
    kind: string;
    key: string;
    payload: Record<string, unknown>;
    runAt?: Date;
  }): Promise<void> {
    await this.sql`
      INSERT INTO work_items (kind, key, run_at, payload)
      VALUES (${input.kind}, ${input.key}, ${input.runAt ?? new Date()}, ${JSON.stringify(input.payload)}::jsonb)
      ON CONFLICT (kind, key) DO NOTHING
    `;
  }

  public async claimWork(workerId: string, limit: number, now = new Date()): Promise<WorkRecord[]> {
    return this.sql<WorkRecord[]>`
      UPDATE work_items AS w
      SET claimed_by = ${workerId},
          lease_until = ${now} + interval '5 minutes',
          attempts = w.attempts + 1,
          updated_at = now()
      FROM (
        SELECT kind, key
        FROM work_items
        WHERE finished_at IS NULL
          AND run_at <= ${now}
          AND (claimed_by IS NULL OR lease_until < ${now})
        ORDER BY run_at
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      ) AS taken
      WHERE w.kind = taken.kind AND w.key = taken.key
      RETURNING w.kind, w.key, w.payload, w.attempts
    `;
  }

  public async finishWork(kind: string, key: string, error?: string): Promise<void> {
    await this.sql`
      UPDATE work_items
      SET finished_at = now(), last_error = ${error ?? null}, updated_at = now()
      WHERE kind = ${kind} AND key = ${key}
    `;
  }

  public async listDueRoutines(now: Date): Promise<RoutineRecord[]> {
    return this.sql<RoutineRecord[]>`
      SELECT id, owner_user_id AS "ownerUserId", agent_id AS "agentId",
             channel_id AS "channelId", instruction, cron
      FROM routines
      WHERE enabled = true AND next_run_at <= ${now}
    `;
  }

  public async markRoutineRun(routineId: string, nextRunAt: Date): Promise<void> {
    await this.sql`
      UPDATE routines SET last_run_at = now(), next_run_at = ${nextRunAt}, updated_at = now()
      WHERE id = ${routineId}
    `;
  }

  public async getUser(userId: string): Promise<SessionUser | null> {
    const rows = await this.sql<{ id: string; email: string; name: string | null }[]>`
      SELECT id, email, name FROM users WHERE id = ${userId}
    `;
    const user = rows.at(0);
    if (user === undefined) {
      return null;
    }
    const roles = await this.sql<{ role: string }[]>`
      SELECT role FROM user_roles WHERE user_id = ${userId} AND role = 'admin'
    `;
    return {
      id: user.id,
      email: user.email,
      name: user.name ?? user.email,
      isAdmin: roles.length > 0,
    };
  }

  public async listPeople(): Promise<SessionUser[]> {
    const rows = await this.sql<
      { id: string; email: string; name: string | null; isAdmin: boolean }[]
    >`
      SELECT u.id, u.email, u.name,
             EXISTS (
               SELECT 1 FROM user_roles r WHERE r.user_id = u.id AND r.role = 'admin'
             ) AS "isAdmin"
      FROM users u
      ORDER BY u.email
    `;
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name ?? row.email,
      isAdmin: row.isAdmin,
    }));
  }

  public async listPlugins(): Promise<PluginRecord[]> {
    return this.sql<PluginRecord[]>`
      SELECT id, title, vendor, url FROM mcp_servers ORDER BY title
    `;
  }

  public async listAgents(): Promise<AgentProfile[]> {
    return this.sql<AgentProfile[]>`
      SELECT a.id, a.name, p.title, p.role_description AS "roleDescription", p.visibility
      FROM agents a
      JOIN agent_profiles p ON p.agent_id = a.id
      ORDER BY p.title
    `;
  }

  public async createAgent(input: {
    name: string;
    title: string;
    roleDescription: string;
    visibility?: string;
  }): Promise<AgentProfile> {
    const id = `agent_${crypto.randomUUID()}`;
    const visibility = input.visibility ?? 'public';
    await this.sql`
      INSERT INTO agents (id, name, type, configuration)
      VALUES (${id}, ${input.name}, 'remote_ag_ui', '{}'::jsonb)
    `;
    await this.sql`
      INSERT INTO agent_profiles (agent_id, title, role_description, visibility)
      VALUES (${id}, ${input.title}, ${input.roleDescription}, ${visibility})
    `;
    return {
      id,
      name: input.name,
      title: input.title,
      roleDescription: input.roleDescription,
      visibility,
    };
  }

  public async updateAgent(id: string, patch: AgentPatch): Promise<AgentProfile | null> {
    const existing = await this.sql<AgentProfile[]>`
      SELECT a.id, a.name, p.title, p.role_description AS "roleDescription", p.visibility
      FROM agents a
      JOIN agent_profiles p ON p.agent_id = a.id
      WHERE a.id = ${id}
    `;
    const current = existing.at(0);
    if (current === undefined) {
      return null;
    }
    const name = patch.name ?? current.name;
    const title = patch.title ?? current.title;
    const roleDescription = patch.roleDescription ?? current.roleDescription;
    const visibility = patch.visibility ?? current.visibility;
    await this.sql`
      UPDATE agents SET name = ${name}, updated_at = now() WHERE id = ${id}
    `;
    await this.sql`
      UPDATE agent_profiles
      SET title = ${title}, role_description = ${roleDescription},
          visibility = ${visibility}, updated_at = now()
      WHERE agent_id = ${id}
    `;
    return { id, name, title, roleDescription, visibility };
  }

  public async deleteAgent(id: string): Promise<boolean> {
    if (id === PROTECTED_AGENT_ID) {
      return false;
    }
    const rows = await this.sql<{ id: string }[]>`
      DELETE FROM agents WHERE id = ${id} RETURNING id
    `;
    return rows.length > 0;
  }

  public async createChannel(input: {
    name: string;
    userId: string;
    agentId?: string;
  }): Promise<ChannelRecord> {
    const workspace = await this.getWorkspaceForUser(input.userId);
    if (!workspace) {
      throw new Error('Workspace not found.');
    }
    const id = `channel_${crypto.randomUUID()}`;
    await this.sql`
      INSERT INTO channels (id, name, description, project_id)
      VALUES (${id}, ${input.name}, '', ${workspace.projectId})
    `;
    await this.attachChannelParties(this.sql, id, input.userId, input.agentId);
    return { id, name: input.name, description: '', lastMessage: null };
  }

  public async listSkills(): Promise<SkillRecord[]> {
    return this.sql<SkillRecord[]>`
      SELECT id, slug, title, summary, instructions FROM skills ORDER BY title
    `;
  }

  public async getSkill(slug: string): Promise<SkillRecord | null> {
    const rows = await this.sql<SkillRecord[]>`
      SELECT id, slug, title, summary, instructions FROM skills WHERE slug = ${slug}
    `;
    return rows.at(0) ?? null;
  }

  public async upsertSkill(input: {
    slug: string;
    title: string;
    summary: string;
    instructions: string;
  }): Promise<SkillRecord> {
    const id = `skill_${crypto.randomUUID()}`;
    const rows = await this.sql<SkillRecord[]>`
      INSERT INTO skills (id, slug, title, summary, instructions)
      VALUES (${id}, ${input.slug}, ${input.title}, ${input.summary}, ${input.instructions})
      ON CONFLICT (slug) DO UPDATE SET
        title = EXCLUDED.title,
        summary = EXCLUDED.summary,
        instructions = EXCLUDED.instructions,
        updated_at = now()
      RETURNING id, slug, title, summary, instructions
    `;
    const row = rows.at(0);
    if (row === undefined) {
      throw new Error('Failed to upsert skill.');
    }
    return row;
  }

  public async deleteSkill(slug: string): Promise<boolean> {
    const rows = await this.sql<{ id: string }[]>`
      DELETE FROM skills WHERE slug = ${slug} RETURNING id
    `;
    return rows.length > 0;
  }

  public async listRoutinesFor(userId: string): Promise<RoutineListItem[]> {
    return this.sql<RoutineListItem[]>`
      SELECT id, owner_user_id AS "ownerUserId", agent_id AS "agentId",
             channel_id AS "channelId", instruction, cron, enabled, timezone,
             next_run_at AS "nextRunAt"
      FROM routines
      WHERE owner_user_id = ${userId}
      ORDER BY created_at DESC
    `;
  }

  public async createRoutine(input: {
    ownerUserId: string;
    agentId: string;
    channelId: string;
    instruction: string;
    cron: string;
    timezone?: string;
    nextRunAt: Date;
  }): Promise<RoutineListItem> {
    const id = `routine_${crypto.randomUUID()}`;
    const timezone = input.timezone ?? 'UTC';
    const rows = await this.sql<RoutineListItem[]>`
      INSERT INTO routines (
        id, owner_user_id, agent_id, channel_id, instruction, cron, timezone, next_run_at
      )
      VALUES (
        ${id}, ${input.ownerUserId}, ${input.agentId}, ${input.channelId},
        ${input.instruction}, ${input.cron}, ${timezone}, ${input.nextRunAt}
      )
      RETURNING id, owner_user_id AS "ownerUserId", agent_id AS "agentId",
                channel_id AS "channelId", instruction, cron, enabled, timezone,
                next_run_at AS "nextRunAt"
    `;
    const row = rows.at(0);
    if (row === undefined) {
      throw new Error('Failed to create routine.');
    }
    return row;
  }

  public async updateRoutine(
    id: string,
    ownerUserId: string,
    patch: RoutinePatch,
  ): Promise<RoutineListItem | null> {
    const existing = await this.sql<RoutineListItem[]>`
      SELECT id, owner_user_id AS "ownerUserId", agent_id AS "agentId",
             channel_id AS "channelId", instruction, cron, enabled, timezone,
             next_run_at AS "nextRunAt"
      FROM routines
      WHERE id = ${id} AND owner_user_id = ${ownerUserId}
    `;
    const current = existing.at(0);
    if (current === undefined) {
      return null;
    }
    const instruction = patch.instruction ?? current.instruction;
    const cron = patch.cron ?? current.cron;
    const timezone = patch.timezone ?? current.timezone;
    const enabled = patch.enabled ?? current.enabled;
    const nextRunAt =
      patch.nextRunAt ??
      (patch.cron !== undefined ? nextRoutineRun(patch.cron) : current.nextRunAt);
    const rows = await this.sql<RoutineListItem[]>`
      UPDATE routines
      SET instruction = ${instruction}, cron = ${cron}, timezone = ${timezone},
          enabled = ${enabled}, next_run_at = ${nextRunAt}, updated_at = now()
      WHERE id = ${id} AND owner_user_id = ${ownerUserId}
      RETURNING id, owner_user_id AS "ownerUserId", agent_id AS "agentId",
                channel_id AS "channelId", instruction, cron, enabled, timezone,
                next_run_at AS "nextRunAt"
    `;
    return rows.at(0) ?? null;
  }

  public async setRoutineEnabled(
    id: string,
    ownerUserId: string,
    enabled: boolean,
  ): Promise<RoutineListItem | null> {
    const rows = await this.sql<RoutineListItem[]>`
      UPDATE routines
      SET enabled = ${enabled}, updated_at = now()
      WHERE id = ${id} AND owner_user_id = ${ownerUserId}
      RETURNING id, owner_user_id AS "ownerUserId", agent_id AS "agentId",
                channel_id AS "channelId", instruction, cron, enabled, timezone,
                next_run_at AS "nextRunAt"
    `;
    return rows.at(0) ?? null;
  }

  public async deleteRoutine(id: string, ownerUserId: string): Promise<boolean> {
    const rows = await this.sql<{ id: string }[]>`
      DELETE FROM routines WHERE id = ${id} AND owner_user_id = ${ownerUserId}
      RETURNING id
    `;
    return rows.length > 0;
  }

  public async getWorkspaceForUser(userId: string): Promise<WorkspaceRecord | null> {
    const rows = await this.sql<
      {
        id: string;
        organization_id: string;
        owner_user_id: string;
        name: string;
        project_id: string;
      }[]
    >`
      SELECT w.id, w.organization_id, w.owner_user_id, w.name, p.id AS project_id
      FROM workspaces w
      JOIN projects p ON p.workspace_id = w.id
      WHERE w.owner_user_id = ${userId}
      ORDER BY w.created_at
      LIMIT 1
    `;
    const row = rows.at(0);
    if (row === undefined) {
      return null;
    }
    return {
      id: row.id,
      organizationId: row.organization_id,
      ownerUserId: row.owner_user_id,
      name: row.name,
      projectId: row.project_id,
      defaultChannelId: personalChannelId(userId),
    };
  }

  public async getChannelScope(channelId: string): Promise<ChannelScope | null> {
    const rows = await this.sql<
      { channel_id: string; project_id: string; workspace_id: string; owner_user_id: string }[]
    >`
      SELECT c.id AS channel_id, c.project_id, p.workspace_id, w.owner_user_id
      FROM channels c
      JOIN projects p ON p.id = c.project_id
      JOIN workspaces w ON w.id = p.workspace_id
      WHERE c.id = ${channelId}
    `;
    const row = rows.at(0);
    if (row === undefined || !row.project_id) {
      return null;
    }
    return {
      channelId: row.channel_id,
      projectId: row.project_id,
      workspaceId: row.workspace_id,
      ownerUserId: row.owner_user_id,
    };
  }

  public async listChannelParticipants(channelId: string): Promise<ChannelParticipant[]> {
    const rows = await this.sql<
      { channel_id: string; principal_type: string; principal_id: string; role: string }[]
    >`
      SELECT channel_id, principal_type, principal_id, role
      FROM channel_participants WHERE channel_id = ${channelId}
    `;
    return rows.map((row) => ({
      channelId: row.channel_id,
      principalType: row.principal_type === 'bot' ? 'bot' : 'user',
      principalId: row.principal_id,
      role: row.role,
    }));
  }

  public async isChannelParticipant(
    channelId: string,
    principalType: 'bot' | 'user',
    principalId: string,
  ): Promise<boolean> {
    const rows = await this.sql<{ n: string }[]>`
      SELECT 1 AS n FROM channel_participants
      WHERE channel_id = ${channelId}
        AND principal_type = ${principalType}
        AND principal_id = ${principalId}
    `;
    return rows.length > 0;
  }

  public async addChannelParticipant(input: ChannelParticipant): Promise<void> {
    await this.sql`
      INSERT INTO channel_participants (channel_id, principal_type, principal_id, role)
      VALUES (${input.channelId}, ${input.principalType}, ${input.principalId}, ${input.role})
      ON CONFLICT DO NOTHING
    `;
  }

  public async appendChannelEvent(input: {
    actorId?: string;
    actorType: string;
    channelId: string;
    payload?: Record<string, unknown>;
    runId?: string;
    type: string;
  }): Promise<ChannelEventRecord> {
    const id = crypto.randomUUID();
    const payload = input.payload ?? {};
    const rows = await this.sql<
      {
        actor_id: string | null;
        actor_type: string;
        channel_id: string;
        created_at: Date;
        id: string;
        payload: Record<string, unknown>;
        run_id: string | null;
        type: string;
      }[]
    >`
      INSERT INTO channel_events (id, channel_id, run_id, type, actor_type, actor_id, payload)
      VALUES (
        ${id}, ${input.channelId}, ${input.runId ?? null}, ${input.type},
        ${input.actorType}, ${input.actorId ?? null}, ${JSON.stringify(payload)}::jsonb
      )
      RETURNING id, channel_id, run_id, type, actor_type, actor_id, payload, created_at
    `;
    const row = rows.at(0);
    if (row === undefined) {
      throw new Error('Failed to append channel event.');
    }
    return {
      id: row.id,
      channelId: row.channel_id,
      runId: row.run_id,
      type: row.type,
      actorType: row.actor_type,
      actorId: row.actor_id,
      payload: row.payload,
      createdAt: row.created_at,
    };
  }

  public async listChannelEvents(channelId: string): Promise<ChannelEventRecord[]> {
    const rows = await this.sql<
      {
        actor_id: string | null;
        actor_type: string;
        channel_id: string;
        created_at: Date;
        id: string;
        payload: Record<string, unknown>;
        run_id: string | null;
        type: string;
      }[]
    >`
      SELECT id, channel_id, run_id, type, actor_type, actor_id, payload, created_at
      FROM channel_events WHERE channel_id = ${channelId} ORDER BY created_at
    `;
    return rows.map((row) => ({
      id: row.id,
      channelId: row.channel_id,
      runId: row.run_id,
      type: row.type,
      actorType: row.actor_type,
      actorId: row.actor_id,
      payload: row.payload,
      createdAt: row.created_at,
    }));
  }

  public async createRun(input: {
    authority: AuthorityEnvelope;
    botId: string;
    channelId: string;
    depth: number;
    id?: string;
    objective: string;
    ownerUserId: string;
    parentRunId?: string;
    projectId: string;
    rootRunId?: string;
    status: RunStatus;
    triggerType: string;
    workspaceId: string;
  }): Promise<RunRecord> {
    const id = input.id ?? crypto.randomUUID();
    const rootRunId = input.rootRunId ?? id;
    const startedAt = input.status === 'running' ? new Date() : null;
    const rows = await this.sql<DbRun[]>`
      INSERT INTO runs (
        id, workspace_id, project_id, channel_id, parent_run_id, root_run_id,
        bot_id, owner_user_id, trigger_type, status, objective, authority, depth, started_at
      )
      VALUES (
        ${id}, ${input.workspaceId}, ${input.projectId}, ${input.channelId},
        ${input.parentRunId ?? null}, ${rootRunId}, ${input.botId}, ${input.ownerUserId},
        ${input.triggerType}, ${input.status}, ${input.objective},
        ${JSON.stringify(input.authority)}::jsonb, ${input.depth}, ${startedAt}
      )
      RETURNING
        id, workspace_id, project_id, channel_id, parent_run_id, root_run_id, bot_id,
        owner_user_id, trigger_type, status, objective, authority, depth, started_at,
        finished_at, error
    `;
    const row = rows.at(0);
    if (row === undefined) {
      throw new Error('Failed to create run.');
    }
    return toRunRecord(row);
  }

  public async getRun(runId: string): Promise<RunRecord | null> {
    const rows = await this.sql<DbRun[]>`
      SELECT id, workspace_id, project_id, channel_id, parent_run_id, root_run_id, bot_id,
             owner_user_id, trigger_type, status, objective, authority, depth, started_at,
             finished_at, error
      FROM runs WHERE id = ${runId}
    `;
    const row = rows.at(0);
    return row ? toRunRecord(row) : null;
  }

  public async updateRunStatus(
    runId: string,
    status: RunStatus,
    error?: string,
  ): Promise<RunRecord | null> {
    const finished =
      status === 'succeeded' || status === 'failed' || status === 'cancelled' ? new Date() : null;
    const rows = await this.sql<DbRun[]>`
      UPDATE runs
      SET status = ${status},
          error = ${error ?? null},
          started_at = CASE
            WHEN ${status} = 'running' AND started_at IS NULL THEN now()
            ELSE started_at
          END,
          finished_at = COALESCE(${finished}, finished_at),
          updated_at = now()
      WHERE id = ${runId}
      RETURNING
        id, workspace_id, project_id, channel_id, parent_run_id, root_run_id, bot_id,
        owner_user_id, trigger_type, status, objective, authority, depth, started_at,
        finished_at, error
    `;
    const row = rows.at(0);
    return row ? toRunRecord(row) : null;
  }

  public async listRunsForChannel(channelId: string): Promise<RunRecord[]> {
    const rows = await this.sql<DbRun[]>`
      SELECT id, workspace_id, project_id, channel_id, parent_run_id, root_run_id, bot_id,
             owner_user_id, trigger_type, status, objective, authority, depth, started_at,
             finished_at, error
      FROM runs WHERE channel_id = ${channelId} ORDER BY created_at
    `;
    return rows.map(toRunRecord);
  }

  public async createDelegatedChild(input: DelegatedChildInput): Promise<RunRecord> {
    return insertDelegatedChild(this.sql, input);
  }

  public async listDelegationsForParent(parentRunId: string): Promise<DelegationRecord[]> {
    const rows = await this.sql<
      {
        authority_envelope: AuthorityEnvelope;
        child_run_id: string;
        from_bot_id: string;
        id: string;
        objective: string;
        parent_run_id: string;
        requested_capabilities: unknown;
        to_bot_id: string;
      }[]
    >`
      SELECT id, parent_run_id, child_run_id, from_bot_id, to_bot_id, objective,
             requested_capabilities, authority_envelope
      FROM delegations WHERE parent_run_id = ${parentRunId}
    `;
    return rows.map((row) => ({
      id: row.id,
      parentRunId: row.parent_run_id,
      childRunId: row.child_run_id,
      fromBotId: row.from_bot_id,
      toBotId: row.to_bot_id,
      objective: row.objective,
      requestedCapabilities: asStringArray(row.requested_capabilities),
      authorityEnvelope: parseEnvelope(row.authority_envelope),
    }));
  }

  private async ensurePersonalWorkspace(user: SessionUser): Promise<void> {
    const workspaceId = personalWorkspaceId(user.id);
    const projectId = personalProjectId(user.id);
    const channelId = personalChannelId(user.id);
    const orgRole = user.isAdmin ? 'admin' : 'member';
    await this.sql.begin(async (sql) => {
      await sql`
        INSERT INTO organizations (id, name) VALUES (${PLATFORM_ORG_ID}, 'gabot')
        ON CONFLICT (id) DO NOTHING
      `;
      await sql`
        INSERT INTO organization_members (organization_id, user_id, role)
        VALUES (${PLATFORM_ORG_ID}, ${user.id}, ${orgRole})
        ON CONFLICT DO NOTHING
      `;
      await sql`
        INSERT INTO workspaces (id, organization_id, owner_user_id, name)
        VALUES (${workspaceId}, ${PLATFORM_ORG_ID}, ${user.id}, ${`${user.name}'s workspace`})
        ON CONFLICT (id) DO NOTHING
      `;
      await sql`
        INSERT INTO projects (id, workspace_id, name)
        VALUES (${projectId}, ${workspaceId}, 'Default')
        ON CONFLICT (id) DO NOTHING
      `;
      await sql`
        INSERT INTO channels (id, name, description, project_id)
        VALUES (${channelId}, ${DEFAULT_CHANNEL_NAME}, 'Default coworker channel', ${projectId})
        ON CONFLICT (id) DO NOTHING
      `;
      await Promise.all([
        this.retireSharedGeneral(sql, user.id),
        this.attachChannelParties(sql, channelId, user.id),
      ]);
    });
  }

  private async retireSharedGeneral(sql: QuerySql, userId: string): Promise<void> {
    await Promise.all([
      sql`
        DELETE FROM channel_memberships WHERE channel_id = 'general' AND user_id = ${userId}
      `,
      sql`
        DELETE FROM channel_participants
        WHERE channel_id = 'general' AND principal_type = 'user' AND principal_id = ${userId}
      `,
    ]);
  }

  private async attachChannelParties(
    sql: QuerySql,
    channelId: string,
    userId: string,
    extraBotId?: string,
  ): Promise<void> {
    const parties = defaultChannelParticipants(channelId, userId, extraBotId);
    await sql`
      INSERT INTO channel_participants ${sql(
        parties.map((party) => ({
          channel_id: party.channelId,
          principal_type: party.principalType,
          principal_id: party.principalId,
          role: party.role,
        })),
      )}
      ON CONFLICT DO NOTHING
    `;
  }
}

export function createSql(url: string): Sql {
  return postgres(url, { max: 8 });
}
