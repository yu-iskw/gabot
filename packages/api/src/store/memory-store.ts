import { randomUUID } from 'node:crypto';

import { DEFAULT_ALLOW_POLICY, nextRoutineRun } from '@gabot/common';

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

/* eslint-disable @typescript-eslint/require-await -- GabotStore is async for Postgres. */

type UserRow = SessionUser;
type Membership = { channelId: string; userId: string };
type ThreadRow = { userId: string; channelId: string; threadId: string };
type GrantRow = { kind: string; ref: string; agentId: string };
type WorkRow = WorkRecord & {
  runAt: Date;
  claimedBy: string | null;
  leaseUntil: Date | null;
  finishedAt: Date | null;
  lastError: string | null;
};
type RoutineRow = RoutineListItem;

const GENERAL_CHANNEL: ChannelRecord = {
  id: 'general',
  name: 'General',
  description: 'Default coworker channel',
  lastMessage: null,
};

export class MemoryStore implements GabotStore {
  private readonly users = new Map<string, UserRow>();
  private readonly channels = new Map<string, ChannelRecord>([
    [GENERAL_CHANNEL.id, { ...GENERAL_CHANNEL }],
  ]);
  private readonly memberships: Membership[] = [];
  private readonly messages: MessageRecord[] = [];
  private readonly threads: ThreadRow[] = [];
  private readonly audits: AuditRecord[] = [];
  private readonly grants: GrantRow[] = [
    { kind: 'component', ref: 'component_note', agentId: 'general-assistant' },
  ];
  private readonly work: WorkRow[] = [];
  private readonly routines: RoutineRow[] = [];
  private readonly agents: AgentProfile[] = [
    {
      id: 'general-assistant',
      name: 'General Assistant',
      title: 'General Assistant',
      roleDescription: 'Helps with governed computer and MCP work.',
      visibility: 'public',
    },
  ];
  private readonly skills: SkillRecord[] = [
    {
      id: 'brief',
      slug: 'brief',
      title: 'Brief',
      summary: 'Summarize in three bullets',
      instructions: 'Summarize the topic in exactly three short bullets.',
    },
  ];
  private policy: ActionPolicy = { ...DEFAULT_ALLOW_POLICY, deny: [...DEFAULT_ALLOW_POLICY.deny] };

  public async upsertUser(person: VerifiedPerson, adminEmails: string[]): Promise<SessionUser> {
    const isAdmin = adminEmails.includes(person.email.toLowerCase());
    const existing = [...this.users.values()].find((row) => row.email === person.email);
    const user: UserRow = existing ?? {
      id: person.id,
      email: person.email,
      name: person.name,
      isAdmin,
    };
    user.isAdmin = isAdmin || user.isAdmin;
    this.users.set(user.id, user);
    if (
      !this.memberships.some(
        (row) => row.userId === user.id && row.channelId === GENERAL_CHANNEL.id,
      )
    ) {
      this.memberships.push({ userId: user.id, channelId: GENERAL_CHANNEL.id });
    }
    return user;
  }

  public async listChannels(userId: string): Promise<ChannelRecord[]> {
    const ids = new Set(
      this.memberships.filter((row) => row.userId === userId).map((row) => row.channelId),
    );
    return [...this.channels.values()].filter((channel) => ids.has(channel.id));
  }

  public async getChannel(channelId: string, userId: string): Promise<ChannelRecord | null> {
    const allowed = this.memberships.some(
      (row) => row.channelId === channelId && row.userId === userId,
    );
    return allowed ? (this.channels.get(channelId) ?? null) : null;
  }

  public async appendMessage(input: {
    channelId: string;
    role: string;
    content: string;
    agentId?: string;
  }): Promise<MessageRecord> {
    const record: MessageRecord = {
      id: randomUUID(),
      channelId: input.channelId,
      role: input.role,
      content: input.content,
      agentId: input.agentId ?? null,
      createdAt: new Date(),
    };
    this.messages.push(record);
    const channel = this.channels.get(input.channelId);
    if (channel) {
      channel.lastMessage = input.content;
    }
    return record;
  }

  public async listMessages(channelId: string): Promise<MessageRecord[]> {
    return this.messages.filter((row) => row.channelId === channelId);
  }

  public async mintThread(userId: string, channelId: string): Promise<string> {
    const existing = this.threads.find(
      (row) => row.userId === userId && row.channelId === channelId,
    );
    if (existing) {
      return existing.threadId;
    }
    const threadId = randomUUID();
    this.threads.push({ userId, channelId, threadId });
    return threadId;
  }

  public async getPolicy(): Promise<ActionPolicy> {
    return { mode: this.policy.mode, deny: [...this.policy.deny], allow: [...this.policy.allow] };
  }

  public async setPolicy(policy: ActionPolicy, _userId: string): Promise<void> {
    this.policy = { mode: policy.mode, deny: [...policy.deny], allow: [...policy.allow] };
  }

  public async insertAudit(input: {
    actorUserId?: string;
    eventType: string;
    targetType: string;
    targetId?: string;
    payload: Record<string, unknown>;
  }): Promise<void> {
    this.audits.unshift({
      eventType: input.eventType,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      payload: input.payload,
      createdAt: new Date(),
      actorUserId: input.actorUserId ?? null,
    });
  }

  public async listAudit(limit: number): Promise<AuditRecord[]> {
    return this.audits.slice(0, limit);
  }

  public async hasGrant(agentId: string, kind: string, ref: string): Promise<boolean> {
    return this.grants.some(
      (row) => row.agentId === agentId && row.kind === kind && row.ref === ref,
    );
  }

  public async listGrants(): Promise<GrantRecord[]> {
    return this.grants.map((row) => ({ kind: row.kind, ref: row.ref, agentId: row.agentId }));
  }

  public async listPluginTools(serverId: string): Promise<PluginTool[]> {
    if (serverId !== 'mock') {
      return [];
    }
    return [
      { name: 'echo', description: 'Echo text', ref: 'mock/echo' },
      { name: 'search', description: 'Harmless search stub', ref: 'mock/search' },
    ];
  }

  public async setGrant(input: {
    agentId: string;
    granted: boolean;
    grantedBy: string;
    kind: string;
    ref: string;
  }): Promise<void> {
    const index = this.grants.findIndex(
      (row) => row.agentId === input.agentId && row.kind === input.kind && row.ref === input.ref,
    );
    if (input.granted && index < 0) {
      this.grants.push({ kind: input.kind, ref: input.ref, agentId: input.agentId });
      return;
    }
    if (!input.granted && index >= 0) {
      this.grants.splice(index, 1);
    }
  }

  public async enqueueWork(input: {
    kind: string;
    key: string;
    payload: Record<string, unknown>;
    runAt?: Date;
  }): Promise<void> {
    if (this.work.some((row) => row.kind === input.kind && row.key === input.key)) {
      return;
    }
    this.work.push({
      kind: input.kind,
      key: input.key,
      payload: input.payload,
      attempts: 0,
      runAt: input.runAt ?? new Date(),
      claimedBy: null,
      leaseUntil: null,
      finishedAt: null,
      lastError: null,
    });
  }

  public async claimWork(workerId: string, limit: number, now = new Date()): Promise<WorkRecord[]> {
    const claimed: WorkRecord[] = [];
    for (const row of this.work) {
      if (claimed.length >= limit || !isClaimable(row, now)) {
        continue;
      }
      row.claimedBy = workerId;
      row.leaseUntil = new Date(now.getTime() + 5 * 60_000);
      row.attempts += 1;
      claimed.push({ kind: row.kind, key: row.key, payload: row.payload, attempts: row.attempts });
    }
    return claimed;
  }

  public async finishWork(kind: string, key: string, error?: string): Promise<void> {
    const row = this.work.find((item) => item.kind === kind && item.key === key);
    if (row) {
      row.finishedAt = new Date();
      row.lastError = error ?? null;
    }
  }

  public async getUser(userId: string): Promise<SessionUser | null> {
    return this.users.get(userId) ?? null;
  }

  public async listPeople(): Promise<SessionUser[]> {
    return [...this.users.values()];
  }

  public async listPlugins(): Promise<PluginRecord[]> {
    return [{ id: 'mock', title: 'Mock MCP', vendor: 'gabot', url: 'http://mcp-mock:4300' }];
  }

  public async listAgents(): Promise<AgentProfile[]> {
    return [...this.agents];
  }

  public async createAgent(input: {
    name: string;
    title: string;
    roleDescription: string;
    visibility?: string;
  }): Promise<AgentProfile> {
    const profile: AgentProfile = {
      id: `agent_${randomUUID()}`,
      name: input.name,
      title: input.title,
      roleDescription: input.roleDescription,
      visibility: input.visibility ?? 'public',
    };
    this.agents.push(profile);
    return profile;
  }

  public async updateAgent(id: string, patch: AgentPatch): Promise<AgentProfile | null> {
    const profile = this.agents.find((row) => row.id === id);
    if (!profile) {
      return null;
    }
    if (patch.name !== undefined) {
      profile.name = patch.name;
    }
    if (patch.title !== undefined) {
      profile.title = patch.title;
    }
    if (patch.roleDescription !== undefined) {
      profile.roleDescription = patch.roleDescription;
    }
    if (patch.visibility !== undefined) {
      profile.visibility = patch.visibility;
    }
    return { ...profile };
  }

  public async deleteAgent(id: string): Promise<boolean> {
    if (id === PROTECTED_AGENT_ID) {
      return false;
    }
    const index = this.agents.findIndex((row) => row.id === id);
    if (index < 0) {
      return false;
    }
    this.agents.splice(index, 1);
    return true;
  }

  public async createChannel(input: {
    name: string;
    userId: string;
    agentId?: string;
  }): Promise<ChannelRecord> {
    const channel: ChannelRecord = {
      id: `channel_${randomUUID()}`,
      name: input.name,
      description: '',
      lastMessage: null,
    };
    this.channels.set(channel.id, channel);
    this.memberships.push({ channelId: channel.id, userId: input.userId });
    return channel;
  }

  public async listSkills(): Promise<SkillRecord[]> {
    return this.skills.map((row) => ({ ...row }));
  }

  public async getSkill(slug: string): Promise<SkillRecord | null> {
    const row = this.skills.find((item) => item.slug === slug);
    return row ? { ...row } : null;
  }

  public async upsertSkill(input: {
    slug: string;
    title: string;
    summary: string;
    instructions: string;
  }): Promise<SkillRecord> {
    const existing = this.skills.find((row) => row.slug === input.slug);
    if (existing) {
      existing.title = input.title;
      existing.summary = input.summary;
      existing.instructions = input.instructions;
      return { ...existing };
    }
    const created: SkillRecord = {
      id: `skill_${randomUUID()}`,
      slug: input.slug,
      title: input.title,
      summary: input.summary,
      instructions: input.instructions,
    };
    this.skills.push(created);
    return { ...created };
  }

  public async deleteSkill(slug: string): Promise<boolean> {
    const index = this.skills.findIndex((row) => row.slug === slug);
    if (index < 0) {
      return false;
    }
    this.skills.splice(index, 1);
    return true;
  }

  public async listRoutinesFor(userId: string): Promise<RoutineListItem[]> {
    return this.routines.filter((row) => row.ownerUserId === userId);
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
    const row: RoutineListItem = {
      id: `routine_${randomUUID()}`,
      ownerUserId: input.ownerUserId,
      agentId: input.agentId,
      channelId: input.channelId,
      instruction: input.instruction,
      cron: input.cron,
      enabled: true,
      timezone: input.timezone ?? 'UTC',
      nextRunAt: input.nextRunAt,
    };
    this.routines.push(row);
    return row;
  }

  public async updateRoutine(
    id: string,
    ownerUserId: string,
    patch: RoutinePatch,
  ): Promise<RoutineListItem | null> {
    const row = this.routines.find((item) => item.id === id && item.ownerUserId === ownerUserId);
    if (!row) {
      return null;
    }
    if (patch.instruction !== undefined) {
      row.instruction = patch.instruction;
    }
    if (patch.timezone !== undefined) {
      row.timezone = patch.timezone;
    }
    if (patch.enabled !== undefined) {
      row.enabled = patch.enabled;
    }
    if (patch.cron !== undefined) {
      row.cron = patch.cron;
      row.nextRunAt = patch.nextRunAt ?? nextRoutineRun(patch.cron);
    } else if (patch.nextRunAt !== undefined) {
      row.nextRunAt = patch.nextRunAt;
    }
    return { ...row };
  }

  public async setRoutineEnabled(
    id: string,
    ownerUserId: string,
    enabled: boolean,
  ): Promise<RoutineListItem | null> {
    const row = this.routines.find((item) => item.id === id && item.ownerUserId === ownerUserId);
    if (!row) {
      return null;
    }
    row.enabled = enabled;
    return row;
  }

  public async deleteRoutine(id: string, ownerUserId: string): Promise<boolean> {
    const index = this.routines.findIndex(
      (item) => item.id === id && item.ownerUserId === ownerUserId,
    );
    if (index < 0) {
      return false;
    }
    this.routines.splice(index, 1);
    return true;
  }

  public async listDueRoutines(now: Date): Promise<RoutineRecord[]> {
    return this.routines.filter((row) => row.enabled && row.nextRunAt <= now);
  }

  public async markRoutineRun(routineId: string, nextRunAt: Date): Promise<void> {
    const row = this.routines.find((item) => item.id === routineId);
    if (row) {
      row.nextRunAt = nextRunAt;
    }
  }

  public addRoutine(routine: RoutineRow): void {
    this.routines.push(routine);
  }
}

function isClaimable(row: WorkRow, now: Date): boolean {
  if (row.finishedAt) {
    return false;
  }
  if (row.runAt > now) {
    return false;
  }
  if (!row.claimedBy) {
    return true;
  }
  return row.leaseUntil !== null && row.leaseUntil < now;
}
