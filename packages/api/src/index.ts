import { createLocalAgentIdentity, createStaticRegistry, type IdentityKey } from '@gabot/common';
import { serve } from '@hono/node-server';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

import { createApiApp } from './app.js';
import { createFirebasePeopleAuth } from './auth.js';
import { createSql, PostgresStore } from './store/postgres-store.js';
import { createHttpAgentRunner } from './turns.js';

const port = Number.parseInt(process.env.PORT ?? '3001', 10);
const databaseUrl = required(process.env.DATABASE_URL, 'DATABASE_URL');
const sql = createSql(databaseUrl);
const store = new PostgresStore(sql);
const projectId = process.env.FIREBASE_PROJECT_ID ?? 'demo-gabot';
const issuer = process.env.GABOT_TOKEN_ISSUER ?? `https://securetoken.google.com/${projectId}`;
const audience = process.env.GABOT_TOKEN_AUDIENCE ?? projectId;
const peopleAuth = createFirebasePeopleAuth({ projectId, issuer, audience });
const agent = createHttpAgentRunner(required(process.env.AGENT_URL, 'AGENT_URL'));

const identity = createLocalAgentIdentity(
  process.env.GABOT_IDENTITY_SECRET ?? 'gabot-dev-identity-secret',
);
const registry = createStaticRegistry([
  {
    id: 'general-assistant',
    kind: 'agent',
    url: process.env.AGENT_URL ?? 'http://agent:4200',
    displayName: 'General Assistant',
  },
  {
    id: 'mock',
    kind: 'mcp-server',
    url: process.env.MCP_MOCK_URL ?? 'http://mcp-mock:4300',
    displayName: 'Mock MCP',
  },
]);
console.info(`gabot-api identity ${identity.principal('gabot-api')}`);
console.info(
  `gabot-api registry ${registry
    .list()
    .map((entry) => entry.id)
    .join(',')}`,
);

await ensureEmulatorAdmin();
const adminIdentities = await resolveAdminIdentities(issuer);

const app = createApiApp({
  store,
  peopleAuth,
  agent,
  mcpUrl: process.env.MCP_MOCK_URL ?? 'http://mcp-mock:4300',
  workerSecret: process.env.WORKER_SHARED_SECRET ?? 'gabot-dev-worker-secret',
  adminIdentities,
});

serve({ fetch: app.fetch, port });
console.info(`gabot-api listening on ${String(port)}`);

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

async function resolveAdminIdentities(tokenIssuer: string): Promise<IdentityKey[]> {
  const subjects = (process.env.INITIAL_ADMIN_SUBJECTS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const keys: IdentityKey[] = subjects.map((subject) => ({
    issuer: tokenIssuer,
    subject,
  }));
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    return keys;
  }
  const emails = (process.env.INITIAL_ADMIN_EMAILS ?? 'admin@example.com')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  for (const email of emails) {
    try {
      const user = await getAuth().getUserByEmail(email);
      keys.push({ issuer: tokenIssuer, subject: user.uid });
    } catch {
      continue;
    }
  }
  return keys;
}

async function ensureEmulatorAdmin(): Promise<void> {
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    return;
  }
  if (getApps().length === 0) {
    initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID ?? 'demo-gabot' });
  }
  try {
    await getAuth().createUser({
      email: 'admin@example.com',
      password: 'gabot-admin-pass',
      emailVerified: true,
      displayName: 'Admin',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (!message.toLowerCase().includes('already')) {
      throw error;
    }
  }
}
