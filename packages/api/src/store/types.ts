import {
  GENERAL_ASSISTANT_ID,
  type ActionPolicy,
  type AuthorityEnvelope,
  type CapabilityGrant,
  type ChannelPolicy,
  type IdentityKey,
  type OwnerConnection,
  type VerifiedPerson,
} from '@gabot/common';

export type ChannelRecord = {
  description: string;
  id: string;
  lastMessage: string | null;
  name: string;
  projectId: string;
};

export type ProjectRecord = {
  id: string;
  name: string;
  workspaceId: string;
};

export type ChannelPolicyRecord = ChannelPolicy;

export type ChannelPatch = {
  description?: string;
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

export type AuditListScope = {
  actorUserId: string;
  workspaceId: string;
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

export type OwnerConnectionRecord = OwnerConnection;
export type CapabilityGrantRecord = CapabilityGrant;

export type CapabilityGrantWrite = {
  capability: string;
  granted: boolean;
  grantedBy: string;
  ownerUserId: string;
  provider: string;
  resource: string;
  workspaceId: string;
};

export type RoutineListItem = RoutineRecord & {
  enabled: boolean;
  timezone: string;
  nextRunAt: Date;
};

export type SessionUser = {
  email: string;
  id: string;
  identity: IdentityKey;
  isAdmin: boolean;
  name: string;
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

export type DelegatedChildInput = {
  authority: AuthorityEnvelope;
  objective: string;
  parent: RunRecord;
  requestedCapabilities: string[];
  toBotId: string;
};

export class DelegationBudgetError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'DelegationBudgetError';
  }
}

export const PROJECT_NOT_FOUND = 'Project not found.';
export const WORKSPACE_NOT_FOUND = 'Workspace not found.';

export type GabotStore = {
  upsertUser(person: VerifiedPerson, adminIdentities: IdentityKey[]): Promise<SessionUser>;
  listChannels(userId: string): Promise<ChannelRecord[]>;
  getChannel(channelId: string, userId: string): Promise<ChannelRecord | null>;
  updateChannel(channelId: string, patch: ChannelPatch): Promise<ChannelRecord | null>;
  archiveChannel(channelId: string): Promise<boolean>;
  listProjects(workspaceId: string): Promise<ProjectRecord[]>;
  createProject(input: { name: string; workspaceId: string }): Promise<ProjectRecord>;
  getProject(projectId: string): Promise<ProjectRecord | null>;
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
  listAudit(limit: number, scope?: AuditListScope): Promise<AuditRecord[]>;
  listOwnerConnections(workspaceId: string): Promise<OwnerConnectionRecord[]>;
  listCapabilityGrants(workspaceId: string): Promise<CapabilityGrantRecord[]>;
  setCapabilityGrant(input: CapabilityGrantWrite): Promise<void>;
  listPluginTools(serverId: string): Promise<PluginTool[]>;
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
  getAgent(id: string): Promise<AgentProfile | null>;
  createAgent(input: {
    name: string;
    title: string;
    roleDescription: string;
    visibility?: string;
  }): Promise<AgentProfile>;
  updateAgent(id: string, patch: AgentPatch): Promise<AgentProfile | null>;
  deleteAgent(id: string): Promise<boolean>;
  createChannel(input: {
    agentId?: string;
    description?: string;
    name: string;
    projectId?: string;
    userId: string;
  }): Promise<ChannelRecord>;
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
  removeChannelParticipant(
    input: Pick<ChannelParticipant, 'channelId' | 'principalId' | 'principalType'>,
  ): Promise<boolean>;
  listChannelPolicies(channelId: string): Promise<ChannelPolicyRecord[]>;
  replaceChannelPolicies(
    channelId: string,
    policies: Array<{ capability: string; resource: string }>,
  ): Promise<ChannelPolicyRecord[]>;
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
  createDelegatedChild(input: DelegatedChildInput): Promise<RunRecord>;
  listDelegationsForParent(parentRunId: string): Promise<DelegationRecord[]>;
};

export const PROTECTED_AGENT_ID = GENERAL_ASSISTANT_ID;
