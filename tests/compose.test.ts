import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const compose = readFileSync(join(root, 'compose/docker-compose.yml'), 'utf8');
const dual = readFileSync(join(root, 'compose/dual.yml'), 'utf8');
const omniOverride = readFileSync(join(root, 'compose/omni.yml'), 'utf8');

function serviceBlock(source: string, name: string): string {
  const key = name.replace(/:$/, '');
  const marker = `\n  ${key}:`;
  const start = source.indexOf(marker);
  if (start < 0) {
    return '';
  }
  const from = start + 1;
  const next = source.slice(from + 1).search(/\n  [a-z][a-z0-9-]+:/i);
  return next < 0 ? source.slice(from) : source.slice(from, from + 1 + next);
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
    expect(dual).toContain('127.0.0.1:3002:3001');
    expect(dual).toContain('127.0.0.1:4201:4200');
    expect(dual).toContain('127.0.0.1:9199:9099');
    expect(compose).not.toMatch(/^\s+- ["']?\d+:\d+/m);
    expect(dual).not.toMatch(/^\s+- ["']?\d+:\d+/m);
  });

  it('does not define computer or supervisor services', () => {
    expect(serviceBlock(compose, 'computer:')).toEqual('');
    expect(serviceBlock(compose, 'supervisor:')).toEqual('');
    expect(compose).not.toContain('COMPUTER_URL');
    expect(compose).not.toContain('COMPUTER_TOKEN');
    expect(compose).not.toContain('SUPERVISOR_URL');
    expect(compose).not.toContain('SUPERVISOR_TOKEN');
    expect(serviceBlock(compose, 'omni:')).toContain('- data');
    expect(serviceBlock(compose, 'api:')).toContain('- data');
    expect(serviceBlock(compose, 'jobs:')).toContain('- data');
  });

  it('runs Atlas migrate then seed after the database is healthy', () => {
    expect(compose).toContain('migrate:');
    expect(compose).toContain('seed:');
    expect(compose).toContain('arigaio/atlas:1.3.3-community');
    expect(compose).toContain('- migrate');
    expect(compose).toContain('- apply');
    expect(compose).toContain('file://migrations');
    expect(compose).toContain('/seed/dev.sql');
    expect(compose).toContain('condition: service_healthy');
    expect(compose).toContain('condition: service_completed_successfully');
    expect(compose).not.toContain('dist/migrate.js');
  });

  it('documents the auth emulator host split', () => {
    expect(compose).toContain('FIREBASE_AUTH_EMULATOR_HOST: auth:9099');
    expect(compose).toContain('0.0.0.0:9099');
  });

  it('includes dual.yml and gates backend B behind the dual profile', () => {
    expect(compose).toMatch(/include:\s*\n\s*-\s*path:\s*dual\.yml/);
    for (const name of [
      'auth-b',
      'create-db-b',
      'migrate-b',
      'seed-b',
      'agent-b',
      'api-b',
      'jobs-b',
    ]) {
      expect(serviceBlock(dual, `${name}:`)).toContain('profiles:');
      expect(serviceBlock(dual, `${name}:`)).toContain('dual');
    }
    expect(dual).toContain('gabot_b');
    expect(dual).toContain('ws-gabot-b');
    expect(dual).toContain('demo-gabot-b');
    expect(serviceBlock(dual, 'api-b:')).toContain('GABOT_TOKEN_AUDIENCE: demo-gabot-b');
    expect(serviceBlock(dual, 'api-b:')).toContain('FIREBASE_AUTH_EMULATOR_HOST: auth-b:9099');
    expect(serviceBlock(dual, 'auth-b:')).toContain('--project');
    expect(serviceBlock(dual, 'auth-b:')).toContain('demo-gabot-b');
    expect(dual).toContain('API_AUDIENCE: http://api-b:3001');
    expect(dual).toContain('AGENT_URL: http://agent-b:4200');
    expect(dual).toContain('API_INTERNAL_URL: http://api-b:3001');
    expect(dual).toContain('arigaio/atlas:1.3.3-community');
    expect(serviceBlock(dual, 'api-b:')).toContain('- data');
    expect(serviceBlock(dual, 'jobs-b:')).toContain('- data');
    expect(serviceBlock(dual, 'agent-b:')).toContain('- data');
  });

  it('ships a workspace directory for dual BFF upstreams', () => {
    const directory = readFileSync(join(root, 'packages/app/workspace-directory.json'), 'utf8');
    expect(directory).toContain('"slug": "gabot"');
    expect(directory).toContain('"slug": "gabot-b"');
    expect(directory).toContain('http://api:3001');
    expect(directory).toContain('http://api-b:3001');
    expect(directory).toContain('ws-gabot');
    expect(directory).toContain('ws-gabot-b');
    expect(directory).toContain('"authDomain": "127.0.0.1:9099"');
    expect(directory).toContain('"authDomain": "127.0.0.1:9199"');
    expect(directory).toContain('"tokenAudience": "demo-gabot"');
    expect(directory).toContain('"tokenAudience": "demo-gabot-b"');
    expect(directory).toContain('gabot.localhost');
    expect(directory).toContain('gabot-b.localhost');
    const hostDirectory = readFileSync(
      join(root, 'packages/app/workspace-directory.host.json'),
      'utf8',
    );
    expect(hostDirectory).toContain('127.0.0.1:3002');
    expect(hostDirectory).toContain('127.0.0.1:9199');
    expect(hostDirectory).toContain('demo-gabot-b');
  });
});
