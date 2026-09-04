import {
  GENERAL_ASSISTANT_ID,
  type ActionPolicy,
  type AuthorityEnvelope,
  type VerifiedPerson,
} from '@gabot/common';

export type ChannelRecord = {
  id: string;
  name: string;
  description: string;
  lastMessage: string | null;
};

export type MessageRecord = {
  id: string;
  channelId: string;
  role: string;
  content: string;
  agentId: string | null;
  createdAt: Date;
};

export type AuditRecord = {
  eventType: string;
  targetType: string;
  targetId: string | null;
  payload: Record<string, unknown>;
  createdAt: Date;
  actorUserId: string | null;
};

export type WorkRecord = {
  kind: string;
  key: string;
  payload: Record<string, unknown>;
  attempts: number;
};

export type RoutineRecord = {
  id: string;
  ownerUserId: string;
  agentId: string;
  channelId: string;
  instruction: string;
  cron: string;
};

export type AgentProfile = {
  id: string;
  name: string;
  title: string;
  roleDescription: string;
  visibility: string;
};

export type SkillRecord = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  instructions: string;
};

export type AgentPatch = {
  name?: string;
  title?: string;
  roleDescription?: string;
  visibility?: string;
};

export type RoutinePatch = {
  instruction?: string;
  cron?: string;
  timezone?: string;
  enabled?: boolean;
  nextRunAt?: Date;
};

export type PluginRecord = {
  id: string;
  title: string;
  vendor: string;
  url: string;
};

export type PluginTool = {
  description: string;
  name: string;
  ref: string;
};

export type GrantRecord = {
  agentId: string;
  kind: string;
  ref: string;
};

export type RoutineListItem = RoutineRecord & {
  enabled: boolean;
  timezone: string;
  nextRunAt: Date;
};

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
};

export type WorkspaceRecord = {
  defaultChannelId: string;
  id: string;
  name: string;
  organizationId: string;
  ownerUserId: string;
  projectId: string;
};

export type ChannelScope = {
  channelId: string;
  ownerUserId: string;
  projectId: string;
  workspaceId: string;
};

export type ChannelParticipant = {
  channelId: string;
  principalId: string;
  principalType: 'bot' | 'user';
  role: string;
};

export type ChannelEventRecord = {
  actorId: string | null;
  actorType: string;
  channelId: string;
  createdAt: Date;
  id: string;
  payload: Record<string, unknown>;
  runId: string | null;
  type: string;
};

export type RunStatus = 'cancelled' | 'failed' | 'queued' | 'running' | 'succeeded';

export type RunRecord = {
  authority: AuthorityEnvelope;
  botId: string;
  channelId: string;
  depth: number;
  error: string | null;
  finishedAt: Date | null;
  id: string;
  objective: string;
  ownerUserId: string;
  parentRunId: string | null;
  projectId: string;
  rootRunId: string;
  startedAt: Date | null;
  status: RunStatus;
  triggerType: string;
  workspaceId: string;
};

export type DelegationRecord = {
  authorityEnvelope: AuthorityEnvelope;
  childRunId: string;
  fromBotId: string;
  id: string;
  objective: string;
  parentRunId: string;
  requestedCapabilities: string[];
  toBotId: string;
};

export type GabotStore = {
  upsertUser(person: VerifiedPerson, adminEmails: string[]): Promise<SessionUser>;
  listChannels(userId: string): Promise<ChannelRecord[]>;
  getChannel(channelId: string, userId: string): Promise<ChannelRecord | null>;
  appendMessage(input: {
    channelId: string;
    role: string;
    content: string;
    agentId?: string;
  }): Promise<MessageRecord>;
  listMessages(channelId: string): Promise<MessageRecord[]>;
  mintThread(userId: string, channelId: string): Promise<string>;
  getPolicy(): Promise<ActionPolicy>;
  setPolicy(policy: ActionPolicy, userId: string): Promise<void>;
  insertAudit(input: {
    actorUserId?: string;
    eventType: string;
    targetType: string;
    targetId?: string;
    payload: Record<string, unknown>;
  }): Promise<void>;
  listAudit(limit: number): Promise<AuditRecord[]>;
  hasGrant(agentId: string, kind: string, ref: string): Promise<boolean>;
  listGrants(): Promise<GrantRecord[]>;
  listPluginTools(serverId: string): Promise<PluginTool[]>;
  setGrant(input: {
    agentId: string;
    granted: boolean;
    grantedBy: string;
    kind: string;
    ref: string;
  }): Promise<void>;
  enqueueWork(input: {
    kind: string;
    key: string;
    payload: Record<string, unknown>;
    runAt?: Date;
  }): Promise<void>;
  claimWork(workerId: string, limit: number, now?: Date): Promise<WorkRecord[]>;
  finishWork(kind: string, key: string, error?: string): Promise<void>;
  getUser(userId: string): Promise<SessionUser | null>;
  listPeople(): Promise<SessionUser[]>;
  listPlugins(): Promise<PluginRecord[]>;
  listAgents(): Promise<AgentProfile[]>;
  createAgent(input: {
    name: string;
    title: string;
    roleDescription: string;
    visibility?: string;
  }): Promise<AgentProfile>;
  updateAgent(id: string, patch: AgentPatch): Promise<AgentProfile | null>;
  deleteAgent(id: string): Promise<boolean>;
  createChannel(input: { name: string; userId: string; agentId?: string }): Promise<ChannelRecord>;
  listSkills(): Promise<SkillRecord[]>;
  getSkill(slug: string): Promise<SkillRecord | null>;
  upsertSkill(input: {
    slug: string;
    title: string;
    summary: string;
    instructions: string;
  }): Promise<SkillRecord>;
  deleteSkill(slug: string): Promise<boolean>;
  listRoutinesFor(userId: string): Promise<RoutineListItem[]>;
  createRoutine(input: {
    ownerUserId: string;
    agentId: string;
    channelId: string;
    instruction: string;
    cron: string;
    timezone?: string;
    nextRunAt: Date;
  }): Promise<RoutineListItem>;
  updateRoutine(
    id: string,
    ownerUserId: string,
    patch: RoutinePatch,
  ): Promise<RoutineListItem | null>;
  setRoutineEnabled(
    id: string,
    ownerUserId: string,
    enabled: boolean,
  ): Promise<RoutineListItem | null>;
  deleteRoutine(id: string, ownerUserId: string): Promise<boolean>;
  listDueRoutines(now: Date): Promise<RoutineRecord[]>;
  markRoutineRun(routineId: string, nextRunAt: Date): Promise<void>;
  getWorkspaceForUser(userId: string): Promise<WorkspaceRecord | null>;
  getChannelScope(channelId: string): Promise<ChannelScope | null>;
  listChannelParticipants(channelId: string): Promise<ChannelParticipant[]>;
  isChannelParticipant(
    channelId: string,
    principalType: 'bot' | 'user',
    principalId: string,
  ): Promise<boolean>;
  addChannelParticipant(input: ChannelParticipant): Promise<void>;
  appendChannelEvent(input: {
    actorId?: string;
    actorType: string;
    channelId: string;
    payload?: Record<string, unknown>;
    runId?: string;
    type: string;
  }): Promise<ChannelEventRecord>;
  listChannelEvents(channelId: string): Promise<ChannelEventRecord[]>;
  createRun(input: {
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
  }): Promise<RunRecord>;
  getRun(runId: string): Promise<RunRecord | null>;
  updateRunStatus(runId: string, status: RunStatus, error?: string): Promise<RunRecord | null>;
  listRunsForChannel(channelId: string): Promise<RunRecord[]>;
  countRunsForRoot(rootRunId: string): Promise<number>;
  countChildRuns(parentRunId: string): Promise<number>;
  createDelegation(input: {
    authorityEnvelope: AuthorityEnvelope;
    childRunId: string;
    fromBotId: string;
    objective: string;
    parentRunId: string;
    requestedCapabilities: string[];
    toBotId: string;
  }): Promise<DelegationRecord>;
  listDelegationsForParent(parentRunId: string): Promise<DelegationRecord[]>;
};

export const PROTECTED_AGENT_ID = GENERAL_ASSISTANT_ID;
