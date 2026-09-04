import { DEFAULT_ALLOW_POLICY, nextRoutineRun } from '@gabot/common';
import postgres from 'postgres';

import { PROTECTED_AGENT_ID } from './types.js';

import type {
  AgentPatch,
  AgentProfile,
  AuditRecord,
  ChannelRecord,
  GabotStore,
  GrantRecord,
  MessageRecord,
  PluginRecord,
  PluginTool,
  RoutineListItem,
  RoutinePatch,
  RoutineRecord,
  SessionUser,
  SkillRecord,
  WorkRecord,
} from './types.js';
import type { ActionPolicy, VerifiedPerson } from '@gabot/common';

type Sql = ReturnType<typeof postgres>;

const GENERAL_CHANNEL_ID = 'general';

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
    await this.sql`
      INSERT INTO channel_memberships (channel_id, user_id)
      VALUES (${GENERAL_CHANNEL_ID}, ${user.id})
      ON CONFLICT DO NOTHING
    `;
    return { id: user.id, email: user.email, name: user.name ?? person.name, isAdmin };
  }

  public async listChannels(userId: string): Promise<ChannelRecord[]> {
    return await this.sql<ChannelRecord[]>`
      SELECT c.id, c.name, c.description, c.last_message AS "lastMessage"
      FROM channels c
      JOIN channel_memberships m ON m.channel_id = c.id
      WHERE m.user_id = ${userId}
      ORDER BY c.created_at
    `;
  }

  public async getChannel(channelId: string, userId: string): Promise<ChannelRecord | null> {
    const rows = await this.sql<ChannelRecord[]>`
      SELECT c.id, c.name, c.description, c.last_message AS "lastMessage"
      FROM channels c
      JOIN channel_memberships m ON m.channel_id = c.id
      WHERE c.id = ${channelId} AND m.user_id = ${userId}
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
    const rows = await this.sql<{ thread_id: string }[]>`
      INSERT INTO threads (user_id, channel_id, thread_id)
      VALUES (${userId}, ${channelId}, ${threadId})
      ON CONFLICT (user_id, channel_id) DO UPDATE SET updated_at = now()
      RETURNING thread_id
    `;
    return rows.at(0)?.thread_id ?? threadId;
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

  public async listAudit(limit: number): Promise<AuditRecord[]> {
    return this.sql<AuditRecord[]>`
      SELECT event_type AS "eventType", target_type AS "targetType", target_id AS "targetId",
             payload, created_at AS "createdAt", actor_user_id AS "actorUserId"
      FROM audit_events
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

  public async claimWork(workerId: string, limit: number, _now?: Date): Promise<WorkRecord[]> {
    return this.sql<WorkRecord[]>`
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
    const id = `channel_${crypto.randomUUID()}`;
    const agentId = input.agentId ?? 'general-assistant';
    await this.sql`
      INSERT INTO channels (id, name, description)
      VALUES (${id}, ${input.name}, '')
    `;
    await this.sql`
      INSERT INTO channel_memberships (channel_id, user_id)
      VALUES (${id}, ${input.userId})
    `;
    await this.sql`
      INSERT INTO channel_agents (channel_id, agent_id)
      VALUES (${id}, ${agentId})
      ON CONFLICT DO NOTHING
    `;
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
}

export function createSql(url: string): Sql {
  return postgres(url, { max: 8 });
}
