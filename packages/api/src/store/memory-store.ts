import { randomUUID } from 'node:crypto';

import {
  assertDelegationBudget,
  asString,
  capabilityGrantId,
  cloneAuthority,
  DEFAULT_ALLOW_POLICY,
  DEFAULT_CHANNEL_NAME,
  DEFAULT_PROJECT_NAME,
  defaultChannelParticipants,
  defaultOwnerConnections,
  defaultOwnerGrants,
  identityKeyEquals,
  nextRoutineRun,
  ownerConnectionId,
  personalChannelId,
  personalProjectId,
  personalWorkspaceId,
  PLATFORM_ORG_ID,
  TEAM_BOT_PROFILES,
} from '@gabot/common';

import { uniquePolicies } from './channel-policies.js';
import {
  DelegationBudgetError,
  PROJECT_NOT_FOUND,
  PROTECTED_AGENT_ID,
  WORKSPACE_NOT_FOUND,
} from './types.js';

import type {
  AgentPatch,
  AgentProfile,
  AuditListScope,
  AuditRecord,
  CapabilityGrantRecord,
  CapabilityGrantWrite,
  ChannelEventRecord,
  ChannelParticipant,
  ChannelPatch,
  ChannelPolicyRecord,
  ChannelRecord,
  ChannelScope,
  DelegatedChildInput,
  DelegationRecord,
  GabotStore,
  MessageRecord,
  OwnerConnectionRecord,
  PluginRecord,
  PluginTool,
  ProjectRecord,
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
import type { ActionPolicy, AuthorityEnvelope, IdentityKey, VerifiedPerson } from '@gabot/common';

/* eslint-disable @typescript-eslint/require-await -- GabotStore is async for Postgres. */

type UserRow = SessionUser;
type ThreadRow = { userId: string; channelId: string; threadId: string };
type WorkRow = WorkRecord & {
  runAt: Date;
  claimedBy: string | null;
  leaseUntil: Date | null;
  finishedAt: Date | null;
  lastError: string | null;
};
type RoutineRow = RoutineListItem;
type ChannelRow = ChannelRecord & { deletedAt: Date | null };
type ProjectRow = ProjectRecord;
type WorkspaceRow = {
  id: string;
  name: string;
  organizationId: string;
  ownerUserId: string;
  projectId: string;
};

export class MemoryStore implements GabotStore {
  private readonly users = new Map<string, UserRow>();
  private readonly workspaces = new Map<string, WorkspaceRow>();
  private readonly projects = new Map<string, ProjectRow>();
  private readonly channels = new Map<string, ChannelRow>();
  private readonly participants: ChannelParticipant[] = [];
  private readonly events: ChannelEventRecord[] = [];
  private readonly channelPolicies: ChannelPolicyRecord[] = [];
  private readonly runs = new Map<string, RunRecord>();
  private readonly delegations: DelegationRecord[] = [];
  private readonly messages: MessageRecord[] = [];
  private readonly threads: ThreadRow[] = [];
  private readonly audits: AuditRecord[] = [];
  private readonly connections: OwnerConnectionRecord[] = [];
  private readonly capabilityGrants: CapabilityGrantRecord[] = [];
  private readonly work: WorkRow[] = [];
  private readonly routines: RoutineRow[] = [];
  private readonly agents: AgentProfile[] = TEAM_BOT_PROFILES.map((bot) => ({ ...bot }));
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

  public async upsertUser(
    person: VerifiedPerson,
    adminIdentities: IdentityKey[],
  ): Promise<SessionUser> {
    const isAdmin = adminIdentities.some((admin) => identityKeyEquals(admin, person.identity));
    const existing = [...this.users.values()].find((row) =>
      identityKeyEquals(row.identity, person.identity),
    );
    const user: UserRow = existing ?? {
      id: person.id,
      email: person.email,
      name: person.name,
      identity: person.identity,
      isAdmin,
    };
    user.email = person.email;
    user.name = person.name;
    user.identity = person.identity;
    user.isAdmin = isAdmin;
    this.users.set(user.id, user);
    this.ensurePersonalWorkspace(user);
    return user;
  }

  public async getWorkspaceForUser(userId: string): Promise<WorkspaceRecord | null> {
    const row = [...this.workspaces.values()].find((item) => item.ownerUserId === userId);
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      organizationId: row.organizationId,
      ownerUserId: row.ownerUserId,
      name: row.name,
      projectId: row.projectId,
      defaultChannelId: personalChannelId(userId),
    };
  }

  public async listChannels(userId: string): Promise<ChannelRecord[]> {
    const ids = new Set(
      this.participants
        .filter((row) => row.principalType === 'user' && row.principalId === userId)
        .map((row) => row.channelId),
    );
    return [...this.channels.values()]
      .filter((channel) => ids.has(channel.id) && channel.deletedAt === null)
      .map(toChannelRecord);
  }

  public async getChannel(channelId: string, userId: string): Promise<ChannelRecord | null> {
    const allowed = this.participants.some(
      (row) =>
        row.channelId === channelId && row.principalType === 'user' && row.principalId === userId,
    );
    const channel = this.channels.get(channelId);
    if (!allowed || !channel || channel.deletedAt !== null) {
      return null;
    }
    return toChannelRecord(channel);
  }

  public async updateChannel(
    channelId: string,
    patch: ChannelPatch,
  ): Promise<ChannelRecord | null> {
    const channel = this.channels.get(channelId);
    if (!channel || channel.deletedAt !== null) {
      return null;
    }
    if (patch.description !== undefined) {
      channel.description = patch.description;
    }
    return toChannelRecord(channel);
  }

  public async archiveChannel(channelId: string): Promise<boolean> {
    const channel = this.channels.get(channelId);
    if (!channel || channel.deletedAt !== null) {
      return false;
    }
    channel.deletedAt = new Date();
    for (const routine of this.routines) {
      if (routine.channelId === channelId) {
        routine.enabled = false;
      }
    }
    return true;
  }

  public async listProjects(workspaceId: string): Promise<ProjectRecord[]> {
    return [...this.projects.values()]
      .filter((row) => row.workspaceId === workspaceId)
      .map((row) => ({ ...row }));
  }

  public async createProject(input: { name: string; workspaceId: string }): Promise<ProjectRecord> {
    const record: ProjectRecord = {
      id: `proj_${randomUUID()}`,
      workspaceId: input.workspaceId,
      name: input.name,
    };
    this.projects.set(record.id, record);
    return { ...record };
  }

  public async getProject(projectId: string): Promise<ProjectRecord | null> {
    const row = this.projects.get(projectId);
    return row ? { ...row } : null;
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

  public async listAudit(limit: number, scope?: AuditListScope): Promise<AuditRecord[]> {
    const rows = scope ? this.audits.filter((row) => auditInScope(row, scope)) : this.audits;
    return rows.slice(0, limit);
  }

  public async listOwnerConnections(workspaceId: string): Promise<OwnerConnectionRecord[]> {
    return this.connections
      .filter((row) => row.workspaceId === workspaceId)
      .map((row) => ({ ...row }));
  }

  public async listCapabilityGrants(workspaceId: string): Promise<CapabilityGrantRecord[]> {
    const ids = new Set(
      this.connections.filter((row) => row.workspaceId === workspaceId).map((row) => row.id),
    );
    return this.capabilityGrants
      .filter((row) => ids.has(row.connectionId))
      .map((row) => ({ ...row }));
  }

  public async setCapabilityGrant(input: CapabilityGrantWrite): Promise<void> {
    const connectionId = ownerConnectionId(input.workspaceId, input.provider);
    const connection = this.connections.find((row) => row.id === connectionId);
    if (!connection || connection.ownerUserId !== input.ownerUserId) {
      throw new Error('Connection not found.');
    }
    const id = capabilityGrantId(connectionId, input.capability, input.resource);
    const index = this.capabilityGrants.findIndex(
      (row) =>
        row.connectionId === connectionId &&
        row.capability === input.capability &&
        row.resource === input.resource,
    );
    if (input.granted && index < 0) {
      this.capabilityGrants.push({
        id,
        connectionId,
        capability: input.capability,
        resource: input.resource,
        grantedBy: input.grantedBy,
      });
      return;
    }
    if (!input.granted && index >= 0) {
      this.capabilityGrants.splice(index, 1);
    }
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
    const user = this.users.get(userId);
    if (!user) {
      return null;
    }
    this.ensurePersonalWorkspace(user);
    return user;
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

  public async getAgent(id: string): Promise<AgentProfile | null> {
    const profile = this.agents.find((row) => row.id === id);
    return profile ? { ...profile } : null;
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
    const remaining = this.participants.filter(
      (row) => row.principalType !== 'bot' || row.principalId !== id,
    );
    this.participants.length = 0;
    this.participants.push(...remaining);
    return true;
  }

  public async createChannel(input: {
    agentId?: string;
    description?: string;
    name: string;
    projectId?: string;
    userId: string;
  }): Promise<ChannelRecord> {
    const workspace = this.workspaces.get(personalWorkspaceId(input.userId));
    if (!workspace) {
      throw new Error(WORKSPACE_NOT_FOUND);
    }
    const projectId = input.projectId ?? workspace.projectId;
    const project = this.projects.get(projectId);
    if (!project || project.workspaceId !== workspace.id) {
      throw new Error(PROJECT_NOT_FOUND);
    }
    const channel: ChannelRow = {
      id: `channel_${randomUUID()}`,
      name: input.name,
      description: input.description ?? '',
      lastMessage: null,
      projectId,
      deletedAt: null,
    };
    this.channels.set(channel.id, channel);
    this.attachChannelParties(channel.id, input.userId, input.agentId);
    return toChannelRecord(channel);
  }

  public async getChannelScope(channelId: string): Promise<ChannelScope | null> {
    const channel = this.channels.get(channelId);
    if (!channel) {
      return null;
    }
    const project = this.projects.get(channel.projectId);
    if (!project) {
      return null;
    }
    const workspace = this.workspaces.get(project.workspaceId);
    if (!workspace) {
      return null;
    }
    return {
      channelId,
      projectId: channel.projectId,
      workspaceId: workspace.id,
      ownerUserId: workspace.ownerUserId,
    };
  }

  public async listChannelParticipants(channelId: string): Promise<ChannelParticipant[]> {
    return this.participants
      .filter((row) => row.channelId === channelId)
      .map((row) => ({ ...row }));
  }

  public async isChannelParticipant(
    channelId: string,
    principalType: 'bot' | 'user',
    principalId: string,
  ): Promise<boolean> {
    return this.participants.some(
      (row) =>
        row.channelId === channelId &&
        row.principalType === principalType &&
        row.principalId === principalId,
    );
  }

  public async addChannelParticipant(input: ChannelParticipant): Promise<void> {
    this.rememberParticipant(input);
  }

  public async removeChannelParticipant(
    input: Pick<ChannelParticipant, 'channelId' | 'principalId' | 'principalType'>,
  ): Promise<boolean> {
    const index = this.participants.findIndex(
      (row) =>
        row.channelId === input.channelId &&
        row.principalType === input.principalType &&
        row.principalId === input.principalId,
    );
    if (index < 0) {
      return false;
    }
    this.participants.splice(index, 1);
    return true;
  }

  public async listChannelPolicies(channelId: string): Promise<ChannelPolicyRecord[]> {
    return this.channelPolicies
      .filter((row) => row.channelId === channelId)
      .map((row) => ({ ...row }));
  }

  public async replaceChannelPolicies(
    channelId: string,
    policies: Array<{ capability: string; resource: string }>,
  ): Promise<ChannelPolicyRecord[]> {
    const remaining = this.channelPolicies.filter((row) => row.channelId !== channelId);
    const next = uniquePolicies(channelId, policies);
    this.channelPolicies.length = 0;
    this.channelPolicies.push(...remaining, ...next);
    return next.map((row) => ({ ...row }));
  }

  public async appendChannelEvent(input: {
    actorId?: string;
    actorType: string;
    channelId: string;
    payload?: Record<string, unknown>;
    runId?: string;
    type: string;
  }): Promise<ChannelEventRecord> {
    const record: ChannelEventRecord = {
      id: randomUUID(),
      channelId: input.channelId,
      runId: input.runId ?? null,
      type: input.type,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      payload: input.payload ?? {},
      createdAt: new Date(),
    };
    this.events.push(record);
    return record;
  }

  public async listChannelEvents(channelId: string): Promise<ChannelEventRecord[]> {
    return this.events.filter((row) => row.channelId === channelId).map((row) => ({ ...row }));
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
    const id = input.id ?? randomUUID();
    const record: RunRecord = {
      id,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      channelId: input.channelId,
      parentRunId: input.parentRunId ?? null,
      rootRunId: input.rootRunId ?? id,
      botId: input.botId,
      ownerUserId: input.ownerUserId,
      triggerType: input.triggerType,
      status: input.status,
      objective: input.objective,
      authority: cloneAuthority(input.authority),
      depth: input.depth,
      startedAt: input.status === 'running' ? new Date() : null,
      finishedAt: null,
      error: null,
    };
    this.runs.set(id, record);
    return { ...record, authority: cloneAuthority(record.authority) };
  }

  public async getRun(runId: string): Promise<RunRecord | null> {
    const row = this.runs.get(runId);
    return row ? cloneRun(row) : null;
  }

  public async updateRunStatus(
    runId: string,
    status: RunStatus,
    error?: string,
  ): Promise<RunRecord | null> {
    const row = this.runs.get(runId);
    if (!row) {
      return null;
    }
    row.status = status;
    if (status === 'running' && !row.startedAt) {
      row.startedAt = new Date();
    }
    if (status === 'succeeded' || status === 'failed' || status === 'cancelled') {
      row.finishedAt = new Date();
      row.error = error ?? null;
    }
    return cloneRun(row);
  }

  public async listRunsForChannel(channelId: string): Promise<RunRecord[]> {
    return [...this.runs.values()].filter((row) => row.channelId === channelId).map(cloneRun);
  }

  public async createDelegatedChild(input: DelegatedChildInput): Promise<RunRecord> {
    const parent = input.parent;
    const budget = assertDelegationBudget({
      depth: parent.depth,
      ...this.countDelegationBudget(parent),
    });
    if (!budget.ok) {
      throw new DelegationBudgetError(budget.reason);
    }
    const child = await this.createRun({
      workspaceId: parent.workspaceId,
      projectId: parent.projectId,
      channelId: parent.channelId,
      parentRunId: parent.id,
      rootRunId: parent.rootRunId,
      botId: input.toBotId,
      ownerUserId: parent.ownerUserId,
      triggerType: 'delegation',
      status: 'queued',
      objective: input.objective,
      authority: input.authority,
      depth: parent.depth + 1,
    });
    await this.createDelegation({
      parentRunId: parent.id,
      childRunId: child.id,
      fromBotId: parent.botId,
      toBotId: input.toBotId,
      objective: input.objective,
      requestedCapabilities: input.requestedCapabilities,
      authorityEnvelope: input.authority,
    });
    await this.enqueueWork({
      kind: 'run.execute',
      key: child.id,
      payload: { runId: child.id },
    });
    await this.appendChannelEvent({
      channelId: parent.channelId,
      runId: child.id,
      type: 'agent.delegation.requested',
      actorType: 'bot',
      actorId: parent.botId,
      payload: { toBotId: input.toBotId, objective: input.objective, parentRunId: parent.id },
    });
    return child;
  }

  public async listDelegationsForParent(parentRunId: string): Promise<DelegationRecord[]> {
    return this.delegations
      .filter((row) => row.parentRunId === parentRunId)
      .map((row) => ({
        ...row,
        requestedCapabilities: [...row.requestedCapabilities],
        authorityEnvelope: cloneAuthority(row.authorityEnvelope),
      }));
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

  private countDelegationBudget(parent: RunRecord): {
    childCount: number;
    rootRunCount: number;
  } {
    let childCount = 0;
    let rootRunCount = 0;
    for (const row of this.runs.values()) {
      if (row.parentRunId === parent.id) {
        childCount += 1;
      }
      if (row.rootRunId === parent.rootRunId) {
        rootRunCount += 1;
      }
    }
    return { childCount, rootRunCount };
  }

  private async createDelegation(input: {
    authorityEnvelope: AuthorityEnvelope;
    childRunId: string;
    fromBotId: string;
    objective: string;
    parentRunId: string;
    requestedCapabilities: string[];
    toBotId: string;
  }): Promise<DelegationRecord> {
    const record: DelegationRecord = {
      id: randomUUID(),
      parentRunId: input.parentRunId,
      childRunId: input.childRunId,
      fromBotId: input.fromBotId,
      toBotId: input.toBotId,
      objective: input.objective,
      requestedCapabilities: [...input.requestedCapabilities],
      authorityEnvelope: cloneAuthority(input.authorityEnvelope),
    };
    this.delegations.push(record);
    return {
      ...record,
      requestedCapabilities: [...record.requestedCapabilities],
      authorityEnvelope: cloneAuthority(record.authorityEnvelope),
    };
  }

  private ensurePersonalWorkspace(user: SessionUser): void {
    const workspaceId = personalWorkspaceId(user.id);
    const projectId = personalProjectId(user.id);
    const channelId = personalChannelId(user.id);
    const createdWorkspace = !this.workspaces.has(workspaceId);
    if (createdWorkspace) {
      this.workspaces.set(workspaceId, {
        id: workspaceId,
        organizationId: PLATFORM_ORG_ID,
        ownerUserId: user.id,
        name: `${user.name}'s workspace`,
        projectId,
      });
    }
    if (!this.projects.has(projectId)) {
      this.projects.set(projectId, {
        id: projectId,
        workspaceId,
        name: DEFAULT_PROJECT_NAME,
      });
    }
    if (!this.channels.has(channelId)) {
      this.channels.set(channelId, {
        id: channelId,
        name: DEFAULT_CHANNEL_NAME,
        description: 'Default coworker channel',
        lastMessage: null,
        projectId,
        deletedAt: null,
      });
      this.attachChannelParties(channelId, user.id);
    } else {
      this.rememberParticipant({
        channelId,
        principalType: 'user',
        principalId: user.id,
        role: 'owner',
      });
    }
    this.seedOwnerConnections(workspaceId, user.id, createdWorkspace);
  }

  private seedOwnerConnections(
    workspaceId: string,
    ownerUserId: string,
    seedGrants: boolean,
  ): void {
    for (const connection of defaultOwnerConnections(workspaceId, ownerUserId)) {
      if (!this.connections.some((row) => row.id === connection.id)) {
        this.connections.push({ ...connection });
      }
    }
    if (!seedGrants) {
      return;
    }
    for (const grant of defaultOwnerGrants(workspaceId, ownerUserId)) {
      if (!this.capabilityGrants.some((row) => row.id === grant.id)) {
        this.capabilityGrants.push({ ...grant });
      }
    }
  }

  private attachChannelParties(channelId: string, userId: string, extraBotId?: string): void {
    for (const party of defaultChannelParticipants(channelId, userId, extraBotId)) {
      this.rememberParticipant(party);
    }
  }

  private rememberParticipant(input: ChannelParticipant): void {
    const exists = this.participants.some(
      (row) =>
        row.channelId === input.channelId &&
        row.principalType === input.principalType &&
        row.principalId === input.principalId,
    );
    if (!exists) {
      this.participants.push({ ...input });
    }
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

function toChannelRecord(channel: ChannelRow): ChannelRecord {
  return {
    id: channel.id,
    name: channel.name,
    description: channel.description,
    lastMessage: channel.lastMessage,
    projectId: channel.projectId,
  };
}

function cloneRun(row: RunRecord): RunRecord {
  return { ...row, authority: cloneAuthority(row.authority) };
}

function auditInScope(row: AuditRecord, scope: AuditListScope): boolean {
  const workspaceId = asString(row.payload.workspaceId);
  if (workspaceId === scope.workspaceId) {
    return true;
  }
  return row.actorUserId === scope.actorUserId && workspaceId === '';
}
