-- ADR 0020: workspace slug (nav handle) + channel public_id (URL UUID).

ALTER TABLE workspaces
  ADD COLUMN slug TEXT;

UPDATE workspaces
SET slug = CASE
  WHEN id LIKE 'ws-%' THEN substring(id FROM 4)
  ELSE id
END
WHERE slug IS NULL;

ALTER TABLE workspaces
  ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX workspaces_slug_uidx ON workspaces (slug);

ALTER TABLE channels
  ADD COLUMN public_id UUID;

UPDATE channels
SET public_id = gen_random_uuid()
WHERE public_id IS NULL;

ALTER TABLE channels
  ALTER COLUMN public_id SET NOT NULL;

ALTER TABLE channels
  ALTER COLUMN public_id SET DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX channels_public_id_uidx ON channels (public_id);
