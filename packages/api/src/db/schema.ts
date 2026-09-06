import {
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    name: text('name'),
    issuer: text('issuer').notNull(),
    subject: text('subject').notNull(),
    tenant: text('tenant').notNull().default(''),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('users_identity_uidx').on(table.issuer, table.tenant, table.subject)],
);

export const userRoles = pgTable(
  'user_roles',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.role] })],
);

export const agents = pgTable('agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  configuration: jsonb('configuration').notNull(),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const channels = pgTable('channels', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  lastMessage: text('last_message'),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const actionPolicy = pgTable('action_policy', {
  id: text('id').primaryKey(),
  mode: text('mode').notNull(),
  deny: text('deny').array().notNull(),
  allow: text('allow').array().notNull(),
  updatedBy: text('updated_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const auditEvents = pgTable('audit_events', {
  id: text('id').primaryKey(),
  actorUserId: text('actor_user_id'),
  eventType: text('event_type').notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id'),
  payload: jsonb('payload').notNull(),
  createdAt: createdAt(),
});

export const workItems = pgTable(
  'work_items',
  {
    kind: text('kind').notNull(),
    key: text('key').notNull(),
    runAt: timestamp('run_at', { withTimezone: true }).notNull(),
    claimedBy: text('claimed_by'),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    attempts: text('attempts'),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    lastError: text('last_error'),
    payload: jsonb('payload').notNull(),
  },
  (table) => [primaryKey({ columns: [table.kind, table.key] })],
);

export const pluginGrants = pgTable(
  'plugin_grants',
  {
    kind: text('kind').notNull(),
    ref: text('ref').notNull(),
    agentId: text('agent_id').notNull(),
    grantedBy: text('granted_by'),
  },
  (table) => [primaryKey({ columns: [table.kind, table.ref, table.agentId] })],
);

export const mastraThreads = pgTable('mastra_threads', {
  id: text('id').primaryKey(),
  resourceId: text('resource_id'),
  title: text('title'),
  metadata: jsonb('metadata'),
  createdAt: createdAt(),
});

export const organizations = pgTable('organizations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const organizationMembers = pgTable(
  'organization_members',
  {
    organizationId: text('organization_id').notNull(),
    userId: text('user_id').notNull(),
    role: text('role').notNull(),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.userId] })],
);

export const workspaces = pgTable(
  'workspaces',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull(),
    ownerUserId: text('owner_user_id').notNull(),
    name: text('name').notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('workspaces_owner_user_id_uidx').on(table.ownerUserId)],
);

export const projects = pgTable('projects', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  name: text('name').notNull(),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const connections = pgTable('connections', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  ownerUserId: text('owner_user_id').notNull(),
  provider: text('provider').notNull(),
  credentialRef: text('credential_ref').notNull(),
  status: text('status').notNull(),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const capabilityGrants = pgTable('capability_grants', {
  id: text('id').primaryKey(),
  connectionId: text('connection_id').notNull(),
  capability: text('capability').notNull(),
  resource: text('resource').notNull(),
  grantedBy: text('granted_by'),
  createdAt: createdAt(),
});

export const channelPolicies = pgTable(
  'channel_policies',
  {
    channelId: text('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    capability: text('capability').notNull(),
    resource: text('resource').notNull(),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.channelId, table.capability, table.resource] })],
);

export const channelParticipants = pgTable(
  'channel_participants',
  {
    channelId: text('channel_id').notNull(),
    principalType: text('principal_type').notNull(),
    principalId: text('principal_id').notNull(),
    role: text('role').notNull(),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.channelId, table.principalType, table.principalId] })],
);

export const channelEvents = pgTable('channel_events', {
  id: text('id').primaryKey(),
  channelId: text('channel_id').notNull(),
  runId: text('run_id'),
  type: text('type').notNull(),
  actorType: text('actor_type').notNull(),
  actorId: text('actor_id'),
  payload: jsonb('payload').notNull(),
  createdAt: createdAt(),
});

export const runs = pgTable('runs', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  projectId: text('project_id').notNull(),
  channelId: text('channel_id').notNull(),
  parentRunId: text('parent_run_id'),
  rootRunId: text('root_run_id').notNull(),
  botId: text('bot_id').notNull(),
  ownerUserId: text('owner_user_id').notNull(),
  triggerType: text('trigger_type').notNull(),
  status: text('status').notNull(),
  objective: text('objective').notNull(),
  authority: jsonb('authority').notNull(),
  depth: integer('depth').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  error: text('error'),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const delegations = pgTable('delegations', {
  id: text('id').primaryKey(),
  parentRunId: text('parent_run_id').notNull(),
  childRunId: text('child_run_id').notNull(),
  fromBotId: text('from_bot_id').notNull(),
  toBotId: text('to_bot_id').notNull(),
  objective: text('objective').notNull(),
  requestedCapabilities: jsonb('requested_capabilities').notNull(),
  authorityEnvelope: jsonb('authority_envelope').notNull(),
  createdAt: createdAt(),
});
