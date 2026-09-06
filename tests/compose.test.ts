import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const compose = readFileSync(join(root, 'compose/docker-compose.yml'), 'utf8');
const omniOverride = readFileSync(join(root, 'compose/omni.yml'), 'utf8');

function serviceBlock(name: string): string {
  const key = name.replace(/:$/, '');
  const marker = `\n  ${key}:`;
  const start = compose.indexOf(marker);
  if (start < 0) {
    return '';
  }
  const from = start + 1;
  const next = compose.slice(from + 1).search(/\n  [a-z][a-z0-9-]+:/i);
  return next < 0 ? compose.slice(from) : compose.slice(from, from + 1 + next);
}

describe('compose contract', () => {
  it('provides Omni or pgvector with a PGDATA subdirectory', () => {
    expect(compose).toContain('pgvector/pgvector');
    expect(compose).toContain('google/alloydbomni');
    expect(compose).toContain('PGDATA');
    expect(omniOverride).toContain('google/alloydbomni:16.8.0');
  });

  it('publishes secret-bearing ports on loopback only', () => {
    for (const port of ['5432', '9099', '4400', '4300', '4200', '3001', '3010']) {
      expect(compose).toContain(`127.0.0.1:${port}:${port}`);
    }
    expect(compose).not.toMatch(/^\s+- ["']?\d+:\d+/m);
  });

  it('does not define computer or supervisor services', () => {
    expect(serviceBlock('computer:')).toEqual('');
    expect(serviceBlock('supervisor:')).toEqual('');
    expect(compose).not.toContain('COMPUTER_URL');
    expect(compose).not.toContain('COMPUTER_TOKEN');
    expect(compose).not.toContain('SUPERVISOR_URL');
    expect(compose).not.toContain('SUPERVISOR_TOKEN');
    expect(serviceBlock('omni:')).toContain('- data');
    expect(serviceBlock('api:')).toContain('- data');
    expect(serviceBlock('jobs:')).toContain('- data');
  });

  it('runs migrations after the database is healthy', () => {
    expect(compose).toContain('migrate:');
    expect(compose).toContain('condition: service_healthy');
    expect(compose).toContain('dist/migrate.js');
  });

  it('documents the auth emulator host split', () => {
    expect(compose).toContain('FIREBASE_AUTH_EMULATOR_HOST: auth:9099');
    expect(compose).toContain('0.0.0.0:9099');
  });
});
