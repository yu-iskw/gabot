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
`;

export const SEED_SQL = `
INSERT INTO agents (id, name, type, configuration)
VALUES ('general-assistant', 'General Assistant', 'built_in', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO agent_profiles (agent_id, title, role_description, visibility)
VALUES ('general-assistant', 'General Assistant', 'Helps with governed computer and MCP work.', 'public')
ON CONFLICT (agent_id) DO NOTHING;

INSERT INTO channels (id, name, description)
VALUES ('general', 'General', 'Default coworker channel')
ON CONFLICT (id) DO NOTHING;

INSERT INTO channel_agents (channel_id, agent_id)
VALUES ('general', 'general-assistant')
ON CONFLICT DO NOTHING;

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

INSERT INTO plugin_grants (kind, ref, agent_id, granted_by)
VALUES ('component', 'component_note', 'general-assistant', 'seed')
ON CONFLICT DO NOTHING;

INSERT INTO skills (id, slug, title, summary, instructions, origin)
VALUES ('brief', 'brief', 'Brief', 'Summarize in three bullets', 'Summarize the request in three bullets.', 'catalogue')
ON CONFLICT (id) DO NOTHING;
`;
