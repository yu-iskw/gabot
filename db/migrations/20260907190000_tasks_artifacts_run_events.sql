-- Task / artifact / sequenced run events / outbox (gabot redesign #28 Stage 1–2 MVP)

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id),
  bot_id TEXT NOT NULL REFERENCES agents(id),
  objective TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'creator',
  success_criteria TEXT NOT NULL,
  resource_scope JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL,
  current_run_id TEXT,
  current_artifact_id TEXT,
  idempotency_key TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tasks_status_check CHECK (status IN (
    'queued', 'working', 'completed', 'failed', 'cancelled', 'partial', 'blocked'
  )),
  CONSTRAINT tasks_idempotency_uidx UNIQUE (created_by, workspace_id, idempotency_key)
);

CREATE INDEX tasks_workspace_created_idx ON tasks (workspace_id, created_at DESC);

CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'diagnosis',
  content TEXT NOT NULL,
  content_ref TEXT NOT NULL,
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  classification TEXT NOT NULL DEFAULT 'internal',
  audience TEXT NOT NULL,
  validation_status TEXT NOT NULL DEFAULT 'unchecked',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT artifacts_task_version_uidx UNIQUE (task_id, version)
);

CREATE TABLE run_events (
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  sequence BIGINT NOT NULL,
  type TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, sequence)
);

CREATE TABLE outbox (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ
);

ALTER TABLE runs ADD COLUMN task_id TEXT;
ALTER TABLE runs
  ADD CONSTRAINT runs_task_id_fkey
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL NOT VALID;
ALTER TABLE runs VALIDATE CONSTRAINT runs_task_id_fkey;
CREATE INDEX runs_task_idx ON runs (task_id);
