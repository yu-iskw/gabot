import { createScriptedPeopleAuth } from '@gabot/common';
import { describe, expect, it } from 'vitest';

import { createApiApp } from './app.js';
import { MemoryStore } from './store/memory-store.js';
import { createScriptedAgentRunner } from './turns.js';

import type { VerifiedPerson } from '@gabot/common';

const TEST_ISSUER = 'https://id.test/gabot';
const TEST_AUDIENCE = 'backend-a';
const adminPerson: VerifiedPerson = {
  id: 'user-1',
  email: 'admin@example.com',
  name: 'Admin',
  identity: { issuer: TEST_ISSUER, subject: 'user-1' },
};
const memberPerson: VerifiedPerson = {
  id: 'user-2',
  email: 'other@example.com',
  name: 'Other',
  identity: { issuer: TEST_ISSUER, subject: 'user-2' },
};
const outsiderPerson: VerifiedPerson = {
  id: 'user-3',
  email: 'out@example.com',
  name: 'Out',
  identity: { issuer: TEST_ISSUER, subject: 'user-3' },
};
const admins = [adminPerson.identity];
const peopleAuth = createScriptedPeopleAuth({
  issuer: TEST_ISSUER,
  audience: TEST_AUDIENCE,
  secret: 'test-secret',
});
const jsonHeaders = (person: VerifiedPerson) => ({
  authorization: `Bearer ${peopleAuth.mintIdToken({
    subject: person.id,
    email: person.email,
    name: person.name,
  })}`,
  'content-type': 'application/json',
});
const AGENT_BODY = { name: 'Ops', title: 'Ops', roleDescription: 'Ops bot' };
const SKILL_BODY = {
  slug: 'brief-me',
  title: 'Brief me',
  summary: 'Short brief',
  instructions: 'Write three bullets.',
};

async function catalogFixture() {
  const store = new MemoryStore();
  const app = createApiApp({
    store,
    peopleAuth,
    agent: createScriptedAgentRunner(),
    mcpUrl: 'http://mcp.test',
    workerSecret: 'worker',
    adminIdentities: admins,
  });
  await store.upsertUser(adminPerson, admins);
  await store.upsertUser(memberPerson, []);
  await store.upsertMembership({ userId: memberPerson.id, role: 'member', status: 'active' });
  await store.upsertUser(outsiderPerson, []);
  const seededAgent = await store.createAgent({
    name: 'Temp',
    title: 'Temp',
    roleDescription: 'temp',
  });
  const seededSkill = await store.upsertSkill({
    slug: 'seeded-skill',
    title: 'Seeded',
    summary: 'Seeded',
    instructions: 'Keep this.',
  });
  return { store, app, seededAgent, seededSkill };
}

async function catalogMutations(
  app: ReturnType<typeof createApiApp>,
  headers: Record<string, string>,
  agentId: string,
  skillSlug: string,
) {
  return Promise.all([
    app.request('/api/agents', {
      method: 'POST',
      headers,
      body: JSON.stringify(AGENT_BODY),
    }),
    app.request(`/api/agents/${agentId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ title: 'Hacked' }),
    }),
    app.request(`/api/agents/${agentId}`, { method: 'DELETE', headers }),
    app.request('/api/skills', {
      method: 'POST',
      headers,
      body: JSON.stringify(SKILL_BODY),
    }),
    app.request(`/api/skills/${skillSlug}`, { method: 'DELETE', headers }),
  ]);
}

describe('catalog write access', () => {
  it.each([
    { label: 'member', person: memberPerson, status: 403 },
    { label: 'outsider', person: outsiderPerson, status: 404 },
  ])('refuses $label catalog writes with $status', async ({ person, status }) => {
    const { app, store, seededAgent, seededSkill } = await catalogFixture();
    const headers = jsonHeaders(person);
    const beforeAgents = (await store.listAgents()).length;
    const responses = await catalogMutations(app, headers, seededAgent.id, seededSkill.slug);
    expect(responses.map((row) => row.status)).toEqual([status, status, status, status, status]);
    expect((await store.listAgents()).length).toBe(beforeAgents);
    expect((await store.getAgent(seededAgent.id))?.title).toBe('Temp');
    expect(await store.getSkill(SKILL_BODY.slug)).toBeNull();
    expect(await store.getSkill(seededSkill.slug)).not.toBeNull();
  });

  it('still lists agents and skills for members and outsiders', async () => {
    const { app } = await catalogFixture();
    const headersList = [jsonHeaders(memberPerson), jsonHeaders(outsiderPerson)];
    for (const headers of headersList) {
      expect((await app.request('/api/agents', { headers })).status).toBe(200);
      expect((await app.request('/api/skills', { headers })).status).toBe(200);
    }
  });
});
