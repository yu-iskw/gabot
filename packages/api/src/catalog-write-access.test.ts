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
  return {
    store,
    app,
    seededAgent,
    seededSkill,
    adminHeaders: jsonHeaders(adminPerson),
    memberHeaders: jsonHeaders(memberPerson),
    outsiderHeaders: jsonHeaders(outsiderPerson),
  };
}

describe('catalog write access', () => {
  it('lets an admin create patch and delete agents and skills', async () => {
    const { app, store, adminHeaders } = await catalogFixture();
    const created = await app.request('/api/agents', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify(AGENT_BODY),
    });
    expect(created.status).toBe(201);
    const agentId = ((await created.json()) as { agent: { id: string } }).agent.id;
    const patched = await app.request(`/api/agents/${agentId}`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ title: 'Renamed' }),
    });
    expect(patched.status).toBe(200);
    expect(((await patched.json()) as { agent: { title: string } }).agent.title).toBe('Renamed');
    expect(
      (await app.request(`/api/agents/${agentId}`, { method: 'DELETE', headers: adminHeaders }))
        .status,
    ).toBe(200);
    expect(await store.getAgent(agentId)).toBeNull();
    const skill = await app.request('/api/skills', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify(SKILL_BODY),
    });
    expect(skill.status).toBe(200);
    expect(
      (
        await app.request(`/api/skills/${SKILL_BODY.slug}`, {
          method: 'DELETE',
          headers: adminHeaders,
        })
      ).status,
    ).toBe(200);
    expect(await store.getSkill(SKILL_BODY.slug)).toBeNull();
  });

  it('refuses member catalog writes with 403 and leaves rows unchanged', async () => {
    const { app, store, seededAgent, seededSkill, memberHeaders } = await catalogFixture();
    const beforeAgents = (await store.listAgents()).length;
    expect(
      (
        await app.request('/api/agents', {
          method: 'POST',
          headers: memberHeaders,
          body: JSON.stringify(AGENT_BODY),
        })
      ).status,
    ).toBe(403);
    expect((await store.listAgents()).length).toBe(beforeAgents);
    expect(
      (
        await app.request(`/api/agents/${seededAgent.id}`, {
          method: 'PATCH',
          headers: memberHeaders,
          body: JSON.stringify({ title: 'Hacked' }),
        })
      ).status,
    ).toBe(403);
    expect((await store.getAgent(seededAgent.id))?.title).toBe('Temp');
    expect(
      (
        await app.request(`/api/agents/${seededAgent.id}`, {
          method: 'DELETE',
          headers: memberHeaders,
        })
      ).status,
    ).toBe(403);
    expect(await store.getAgent(seededAgent.id)).not.toBeNull();
    expect(
      (
        await app.request('/api/skills', {
          method: 'POST',
          headers: memberHeaders,
          body: JSON.stringify(SKILL_BODY),
        })
      ).status,
    ).toBe(403);
    expect(await store.getSkill(SKILL_BODY.slug)).toBeNull();
    expect(
      (
        await app.request(`/api/skills/${seededSkill.slug}`, {
          method: 'DELETE',
          headers: memberHeaders,
        })
      ).status,
    ).toBe(403);
    expect(await store.getSkill(seededSkill.slug)).not.toBeNull();
  });

  it('hides catalog writes from outsiders with 404', async () => {
    const { app, store, seededAgent, seededSkill, outsiderHeaders } = await catalogFixture();
    const beforeAgents = (await store.listAgents()).length;
    expect(
      (
        await app.request('/api/agents', {
          method: 'POST',
          headers: outsiderHeaders,
          body: JSON.stringify(AGENT_BODY),
        })
      ).status,
    ).toBe(404);
    expect((await store.listAgents()).length).toBe(beforeAgents);
    expect(
      (
        await app.request(`/api/agents/${seededAgent.id}`, {
          method: 'PATCH',
          headers: outsiderHeaders,
          body: JSON.stringify({ title: 'Hacked' }),
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await app.request(`/api/agents/${seededAgent.id}`, {
          method: 'DELETE',
          headers: outsiderHeaders,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await app.request('/api/skills', {
          method: 'POST',
          headers: outsiderHeaders,
          body: JSON.stringify(SKILL_BODY),
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await app.request(`/api/skills/${seededSkill.slug}`, {
          method: 'DELETE',
          headers: outsiderHeaders,
        })
      ).status,
    ).toBe(404);
    expect(await store.getAgent(seededAgent.id)).not.toBeNull();
    expect(await store.getSkill(seededSkill.slug)).not.toBeNull();
  });

  it('still lists agents and skills for members and outsiders', async () => {
    const { app, memberHeaders, outsiderHeaders } = await catalogFixture();
    expect((await app.request('/api/agents', { headers: memberHeaders })).status).toBe(200);
    expect((await app.request('/api/skills', { headers: memberHeaders })).status).toBe(200);
    expect((await app.request('/api/agents', { headers: outsiderHeaders })).status).toBe(200);
    expect((await app.request('/api/skills', { headers: outsiderHeaders })).status).toBe(200);
  });
});
