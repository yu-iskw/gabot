import { jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

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
