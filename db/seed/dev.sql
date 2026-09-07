-- Compose / local catalog seed (ADR 0019). Not applied by Cloud Run migrate Jobs.

INSERT INTO organizations (id, name)
VALUES ('org-gabot', 'gabot')
ON CONFLICT (id) DO NOTHING;

INSERT INTO agents (id, name, type, configuration)
VALUES ('general-assistant', 'General Assistant', 'built_in', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO agent_profiles (agent_id, title, role_description, visibility)
VALUES ('general-assistant', 'General Assistant', 'Helps with governed MCP work.', 'public')
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

INSERT INTO mastra_threads (id, resource_id, title)
VALUES ('bootstrap', 'gabot', 'Mastra PostgresStore')
ON CONFLICT (id) DO NOTHING;

-- Workspace-scoped connections appear after first admin bootstrap creates a workspace.
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
