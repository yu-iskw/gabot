-- Clean-bootstrap sketch for catalog templates and bot instances (ADR 0018).
-- Not wired into the prototype SCHEMA_SQL migrate path (ADR 0017).
-- Enterprise bootstrap may adopt these tables without rewriting unique-owner
-- prototype invariants in place.

CREATE TABLE IF NOT EXISTS catalog_entries (
  id TEXT PRIMARY KEY,
  entry_type TEXT NOT NULL,
  slug TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1',
  publisher_kind TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  declaration JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT catalog_entries_entry_type_check CHECK (
    entry_type IN (
      'bot-template',
      'bot-team-template',
      'skill',
      'mcp-server',
      'a2a-agent'
    )
  ),
  CONSTRAINT catalog_entries_publisher_kind_check CHECK (
    publisher_kind IN ('builtin', 'workspace', 'remote')
  )
);

-- Slug uniqueness is scoped by entry_type within one backend catalog origin.
CREATE UNIQUE INDEX IF NOT EXISTS catalog_entries_type_slug_uidx
  ON catalog_entries (entry_type, slug);

CREATE TABLE IF NOT EXISTS bot_instances (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  instruction TEXT NOT NULL,
  template_id TEXT REFERENCES catalog_entries(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, slug)
);

-- Optional enablement of a skill catalog entry on a bot instance.
CREATE TABLE IF NOT EXISTS bot_skill_bindings (
  bot_instance_id TEXT NOT NULL REFERENCES bot_instances(id) ON DELETE CASCADE,
  skill_entry_id TEXT NOT NULL REFERENCES catalog_entries(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (bot_instance_id, skill_entry_id)
);

-- Declared capability requirements copied from a template at install time.
-- Grants and connections remain on workspace connections (ADR 0011 / 0012).
CREATE TABLE IF NOT EXISTS bot_capability_requirements (
  bot_instance_id TEXT NOT NULL REFERENCES bot_instances(id) ON DELETE CASCADE,
  capability TEXT NOT NULL,
  resource_hint TEXT NOT NULL DEFAULT '',
  catalog_entry_id TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (bot_instance_id, capability, resource_hint, catalog_entry_id)
);

-- Live channel roster continues to use channel_participants.
-- When migrating off kebab agent ids, principal_id for bots SHOULD store
-- bot_instances.id (UUID). Wire @mentions resolve via bot_instances.slug.
