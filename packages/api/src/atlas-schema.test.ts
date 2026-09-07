import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_ALLOW_POLICY } from '@gabot/common';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const bootstrap = readFileSync(join(root, 'db/migrations/20260907120000_bootstrap.sql'), 'utf8');
const seed = readFileSync(join(root, 'db/seed/dev.sql'), 'utf8');
const atlasSum = readFileSync(join(root, 'db/migrations/atlas.sum'), 'utf8');

describe('atlas bootstrap migration', () => {
  it('creates vector extension before mastra tables', () => {
    const extension = bootstrap.indexOf('CREATE EXTENSION IF NOT EXISTS vector');
    const mastra = bootstrap.indexOf('CREATE TABLE mastra_threads');
    expect(extension).toBeGreaterThanOrEqual(0);
    expect(mastra).toBeGreaterThan(extension);
  });

  it('defines the live control-plane tables without legacy membership tables', () => {
    expect(bootstrap).toContain('CREATE TABLE runs');
    expect(bootstrap).toContain('CREATE TABLE connections');
    expect(bootstrap).toContain('CREATE TABLE capability_grants');
    expect(bootstrap).toContain('CREATE TABLE channel_policies');
    expect(bootstrap).toContain('users_identity_uidx');
    expect(bootstrap).toContain('CREATE TABLE workspace_members');
    expect(bootstrap).toContain('CREATE TABLE organization_members');
    expect(bootstrap).toContain('channels_project_id_fkey');
    expect(bootstrap).not.toContain('CREATE UNIQUE INDEX workspaces_owner_user_id_uidx');
    expect(bootstrap).not.toContain('channel_memberships');
    expect(bootstrap).not.toContain('channel_agents');
    expect(DEFAULT_ALLOW_POLICY.allow).toEqual(['true']);
  });

  it('keeps catalog seed and mastra bootstrap out of migrations', () => {
    expect(seed).toContain("VALUES ('org-gabot', 'gabot')");
    expect(seed).toContain("VALUES ('bootstrap', 'gabot', 'Mastra PostgresStore')");
    expect(seed).toContain('INSERT INTO connections');
    expect(bootstrap).not.toContain('INSERT INTO agents');
    expect(atlasSum).toContain('20260907120000_bootstrap.sql');
  });
});
