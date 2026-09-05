export const SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_profiles (
  agent_id TEXT PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  role_description TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'public',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  last_message TEXT,
  last_message_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Legacy tables. Live membership is channel_participants; do not seed or query
-- these for new features. Kept so existing migrate SQL stays idempotent.
CREATE TABLE IF NOT EXISTS channel_memberships (
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, user_id)
);

CREATE TABLE IF NOT EXISTS channel_agents (
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, agent_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  agent_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS threads (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, channel_id)
);

CREATE TABLE IF NOT EXISTS credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL,
  provider TEXT NOT NULL,
  encrypted_value TEXT NOT NULL,
  key_id TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id TEXT,
  event_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_created_at_idx ON audit_events (created_at);
CREATE INDEX IF NOT EXISTS audit_events_type_time_idx ON audit_events (event_type, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS action_policy (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  deny TEXT[] NOT NULL,
  allow TEXT[] NOT NULL,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS computer_snapshot (
  computer_id TEXT PRIMARY KEY,
  snapshot_id INTEGER NOT NULL,
  url TEXT NOT NULL,
  elements JSONB NOT NULL,
  taken_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  session TEXT
);

CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  vendor TEXT NOT NULL,
  url TEXT NOT NULL,
  provenance TEXT NOT NULL DEFAULT 'first-party',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mcp_tools (
  server_id TEXT NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  input_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (server_id, name)
);

CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  instructions TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT 'catalogue',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS skill_tools (
  skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  ref TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (skill_id, ref)
);

CREATE TABLE IF NOT EXISTS plugin_grants (
  kind TEXT NOT NULL,
  ref TEXT NOT NULL,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  granted_by TEXT,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, ref, agent_id)
);

CREATE TABLE IF NOT EXISTS components (
  name TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  draft_description TEXT NOT NULL DEFAULT '',
  published_description TEXT,
  published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS work_items (
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_by TEXT,
  lease_until TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  finished_at TIMESTAMPTZ,
  last_error TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, key)
);
CREATE INDEX IF NOT EXISTS work_items_claimable_idx ON work_items (kind, run_at);

CREATE TABLE IF NOT EXISTS routines (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  instruction TEXT NOT NULL,
  cron TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  enabled BOOLEAN NOT NULL DEFAULT true,
  next_run_at TIMESTAMPTZ NOT NULL,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS routine_runs (
  id TEXT PRIMARY KEY,
  routine_id TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT,
  error TEXT
);

CREATE TABLE IF NOT EXISTS mastra_threads (
  id TEXT PRIMARY KEY,
  resource_id TEXT,
  title TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mastra_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES mastra_threads(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_members (
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workspaces_owner_required CHECK (owner_user_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS workspaces_owner_user_id_uidx ON workspaces (owner_user_id);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  credential_ref TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, provider)
);

CREATE TABLE IF NOT EXISTS capability_grants (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  capability TEXT NOT NULL,
  resource TEXT NOT NULL,
  granted_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (connection_id, capability, resource)
);

ALTER TABLE channels ADD COLUMN IF NOT EXISTS project_id TEXT;

CREATE TABLE IF NOT EXISTS channel_participants (
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  principal_type TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, principal_type, principal_id)
);

CREATE TABLE IF NOT EXISTS channel_events (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  run_id TEXT,
  type TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS channel_events_channel_idx ON channel_events (channel_id, created_at);

CREATE TABLE IF NOT EXISTS channel_policies (
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  capability TEXT NOT NULL,
  resource TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, capability, resource)
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  parent_run_id TEXT REFERENCES runs(id) ON DELETE SET NULL,
  root_run_id TEXT NOT NULL,
  bot_id TEXT NOT NULL REFERENCES agents(id),
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  trigger_type TEXT NOT NULL,
  status TEXT NOT NULL,
  objective TEXT NOT NULL DEFAULT '',
  authority JSONB NOT NULL DEFAULT '{}'::jsonb,
  depth INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS runs_channel_idx ON runs (channel_id, created_at);
CREATE INDEX IF NOT EXISTS runs_root_idx ON runs (root_run_id);

CREATE TABLE IF NOT EXISTS delegations (
  id TEXT PRIMARY KEY,
  parent_run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  child_run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  from_bot_id TEXT NOT NULL,
  to_bot_id TEXT NOT NULL,
  objective TEXT NOT NULL,
  requested_capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  authority_envelope JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS delegations_parent_idx ON delegations (parent_run_id);

INSERT INTO organizations (id, name)
VALUES ('org-gabot', 'gabot')
ON CONFLICT (id) DO NOTHING;

INSERT INTO organization_members (organization_id, user_id, role)
SELECT 'org-gabot', u.id,
  CASE WHEN EXISTS (
    SELECT 1 FROM user_roles r WHERE r.user_id = u.id AND r.role = 'admin'
  ) THEN 'admin' ELSE 'member' END
FROM users u
ON CONFLICT DO NOTHING;

INSERT INTO workspaces (id, organization_id, owner_user_id, name)
SELECT 'ws-' || id, 'org-gabot', id, COALESCE(name, 'User') || '''s workspace'
FROM users
ON CONFLICT (id) DO NOTHING;

INSERT INTO projects (id, workspace_id, name)
SELECT 'proj-' || id, 'ws-' || id, 'Default'
FROM users
ON CONFLICT (id) DO NOTHING;

INSERT INTO channels (id, name, description, project_id)
SELECT 'ch-' || id || '-general', 'General', 'Default coworker channel', 'proj-' || id
FROM users
ON CONFLICT (id) DO NOTHING;

INSERT INTO channel_participants (channel_id, principal_type, principal_id, role)
SELECT 'ch-' || id || '-general', 'user', id, 'owner'
FROM users
ON CONFLICT DO NOTHING;

INSERT INTO channel_participants (channel_id, principal_type, principal_id, role)
SELECT 'ch-' || u.id || '-general', 'bot', b.id, 'bot'
FROM users u
CROSS JOIN (
  VALUES ('general-assistant'), ('monitor'), ('triage'), ('coder')
) AS b(id)
ON CONFLICT DO NOTHING;

INSERT INTO connections (id, workspace_id, owner_user_id, provider, credential_ref, status)
SELECT 'conn-' || id || '-gabot', id, owner_user_id, 'gabot', 'local', 'active' FROM workspaces
ON CONFLICT (id) DO NOTHING;
INSERT INTO connections (id, workspace_id, owner_user_id, provider, credential_ref, status)
SELECT 'conn-' || id || '-mock-mcp', id, owner_user_id, 'mock-mcp', 'mcp-mock', 'active' FROM workspaces
ON CONFLICT (id) DO NOTHING;
INSERT INTO connections (id, workspace_id, owner_user_id, provider, credential_ref, status)
SELECT 'conn-' || id || '-github', id, owner_user_id, 'github', 'github-stub', 'active' FROM workspaces
ON CONFLICT (id) DO NOTHING;

INSERT INTO capability_grants (id, connection_id, capability, resource, granted_by)
SELECT 'cg-' || id || '-component-note', 'conn-' || id || '-gabot',
       'component:component_note', 'component_note', owner_user_id
FROM workspaces
ON CONFLICT (connection_id, capability, resource) DO NOTHING;
INSERT INTO capability_grants (id, connection_id, capability, resource, granted_by)
SELECT 'cg-' || id || '-github-acme-allowed', 'conn-' || id || '-github',
       'github.issues.create', 'acme/allowed', owner_user_id
FROM workspaces
ON CONFLICT (connection_id, capability, resource) DO NOTHING;

UPDATE routines
SET channel_id = 'ch-' || owner_user_id || '-general'
WHERE channel_id = 'general';

DELETE FROM channel_participants WHERE channel_id = 'general';
DELETE FROM channel_memberships WHERE channel_id = 'general';
DELETE FROM channel_agents WHERE channel_id = 'general';

INSERT INTO channel_participants (channel_id, principal_type, principal_id, role)
SELECT channel_id, 'user', user_id, 'member' FROM channel_memberships
ON CONFLICT DO NOTHING;

INSERT INTO channel_participants (channel_id, principal_type, principal_id, role)
SELECT channel_id, 'bot', agent_id, 'bot' FROM channel_agents
ON CONFLICT DO NOTHING;

UPDATE channels AS c
SET project_id = 'proj-' || first_member.user_id
FROM (
  SELECT DISTINCT ON (channel_id) channel_id, user_id
  FROM channel_memberships
  ORDER BY channel_id, created_at
) AS first_member
WHERE c.id = first_member.channel_id AND c.project_id IS NULL;

UPDATE channels AS c
SET project_id = p.id
FROM channel_participants cp
JOIN workspaces w ON w.owner_user_id = cp.principal_id AND cp.principal_type = 'user'
JOIN projects p ON p.workspace_id = w.id AND p.id = 'proj-' || w.owner_user_id
WHERE c.id = cp.channel_id AND c.project_id IS NULL;

UPDATE channels
SET project_id = (
  SELECT p.id FROM projects p ORDER BY p.created_at, p.id LIMIT 1
)
WHERE project_id IS NULL AND EXISTS (SELECT 1 FROM projects);

ALTER TABLE channels ALTER COLUMN project_id SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE channels
    ADD CONSTRAINT channels_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES projects(id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
`;

export const SEED_SQL = `
INSERT INTO organizations (id, name)
VALUES ('org-gabot', 'gabot')
ON CONFLICT (id) DO NOTHING;

INSERT INTO agents (id, name, type, configuration)
VALUES ('general-assistant', 'General Assistant', 'built_in', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO agent_profiles (agent_id, title, role_description, visibility)
VALUES ('general-assistant', 'General Assistant', 'Helps with governed computer and MCP work.', 'public')
ON CONFLICT (agent_id) DO NOTHING;

INSERT INTO agents (id, name, type, configuration)
VALUES ('monitor', 'Monitor', 'built_in', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO agent_profiles (agent_id, title, role_description, visibility)
VALUES ('monitor', 'Monitor', 'Watches systems and delegates triage.', 'public')
ON CONFLICT (agent_id) DO NOTHING;

INSERT INTO agents (id, name, type, configuration)
VALUES ('triage', 'Triage', 'built_in', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO agent_profiles (agent_id, title, role_description, visibility)
VALUES ('triage', 'Triage', 'Turns incidents into actionable work and delegates coding.', 'public')
ON CONFLICT (agent_id) DO NOTHING;

INSERT INTO agents (id, name, type, configuration)
VALUES ('coder', 'Coder', 'built_in', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO agent_profiles (agent_id, title, role_description, visibility)
VALUES ('coder', 'Coder', 'Implements delegated coding work.', 'public')
ON CONFLICT (agent_id) DO NOTHING;

INSERT INTO action_policy (id, mode, deny, allow)
VALUES ('current', 'enforce', ARRAY[]::text[], ARRAY['true'])
ON CONFLICT (id) DO NOTHING;

INSERT INTO mcp_servers (id, title, vendor, url, provenance)
VALUES ('mock', 'Mock MCP', 'gabot', 'http://mcp-mock:4300', 'first-party')
ON CONFLICT (id) DO NOTHING;

INSERT INTO mcp_tools (server_id, name, description, input_schema)
VALUES ('mock', 'echo', 'Echo text', '{"type":"object","properties":{"text":{"type":"string"}}}'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO mcp_tools (server_id, name, description, input_schema)
VALUES ('mock', 'search', 'Harmless search stub', '{"type":"object","properties":{"query":{"type":"string"}}}'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO components (name, title, kind, draft_description, published_description, published)
VALUES ('component_note', 'Note', 'card', 'A note card', 'A granted note component', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO skills (id, slug, title, summary, instructions, origin)
VALUES ('brief', 'brief', 'Brief', 'Summarize in three bullets', 'Summarize the request in three bullets.', 'catalogue')
ON CONFLICT (id) DO NOTHING;
`;
