/**
 * Docker-free durable-task demo API: MemoryStore + Firebase Auth emulator +
 * in-process work poller (same path as packages/jobs → /api/internal/runs/execute).
 *
 * Not used in production. See packages/api/src/index.ts for the Postgres entrypoint.
 */
import { createLocalAgentIdentity, createStaticRegistry, type IdentityKey } from '@gabot/common';
import { serve } from '@hono/node-server';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

import { createApiApp } from './app.js';
import { createFirebasePeopleAuth } from './auth.js';
import { MemoryStore } from './store/memory-store.js';
import { createScriptedAgentRunner } from './turns.js';

const port = Number.parseInt(process.env.PORT ?? '3001', 10);
const projectId = process.env.FIREBASE_PROJECT_ID ?? 'demo-gabot';
const issuer = process.env.GABOT_TOKEN_ISSUER ?? `https://securetoken.google.com/${projectId}`;
const audience = process.env.GABOT_TOKEN_AUDIENCE ?? projectId;
const workerSecret = process.env.WORKER_SHARED_SECRET ?? 'gabot-dev-worker-secret';
const apiUrl = `http://127.0.0.1:${String(port)}`;
const store = new MemoryStore();
const peopleAuth = createFirebasePeopleAuth({ projectId, issuer, audience });
const agent = createScriptedAgentRunner();

const identity = createLocalAgentIdentity(
  process.env.GABOT_IDENTITY_SECRET ?? 'gabot-dev-identity-secret',
);
const registry = createStaticRegistry([
  {
    id: 'general-assistant',
    kind: 'agent',
    url: process.env.AGENT_URL ?? 'http://127.0.0.1:4200',
    displayName: 'General Assistant',
  },
  {
    id: 'mock',
    kind: 'mcp-server',
    url: process.env.MCP_MOCK_URL ?? 'http://127.0.0.1:4300',
    displayName: 'Mock MCP',
  },
]);
console.info(`gabot-api-demo identity ${identity.principal('gabot-api')}`);
console.info(
  `gabot-api-demo registry ${registry
    .list()
    .map((entry) => entry.id)
    .join(',')}`,
);

if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('FIREBASE_AUTH_EMULATOR_HOST is required for the durable-task demo server');
}

await ensureEmulatorAdmin();
const adminIdentities = await resolveAdminIdentities(issuer);

const app = createApiApp({
  store,
  peopleAuth,
  agent,
  mcpUrl: process.env.MCP_MOCK_URL ?? 'http://127.0.0.1:4300',
  workerSecret,
  adminIdentities,
});

serve({ fetch: app.fetch, port });
console.info(`gabot-api-demo listening on ${String(port)} (MemoryStore)`);

const pollMs = Number.parseInt(process.env.DEMO_WORKER_POLL_MS ?? '400', 10);
setInterval(() => {
  void pollWork().catch((error: unknown) => {
    console.error('demo worker poll failed', error);
  });
}, pollMs);

async function pollWork(): Promise<void> {
  const items = await store.claimWork('demo-jobs', 10);
  for (const item of items) {
    if (item.kind !== 'run.execute') {
      await store.finishWork(item.kind, item.key);
      continue;
    }
    const runIdRaw = item.payload.runId ?? item.key;
    const runId = typeof runIdRaw === 'string' ? runIdRaw : String(runIdRaw);
    const response = await fetch(`${apiUrl}/api/internal/runs/execute`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-gabot-worker-secret': workerSecret,
      },
      body: JSON.stringify({ runId, workerId: 'demo-jobs' }),
    });
    if (!response.ok) {
      console.error(`demo worker execute failed runId=${runId} status=${String(response.status)}`);
    }
    await store.finishWork(item.kind, item.key);
  }
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
