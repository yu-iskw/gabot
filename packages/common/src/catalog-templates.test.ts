import { describe, expect, it } from 'vitest';

import {
  assertNoSecretsInDeclaration,
  buildInstallChecklist,
  isCatalogSlug,
  isCatalogUuid,
  looksLikeGabotSkillRowId,
  mcpToolWireName,
  newCatalogId,
  parseA2AAgentDeclaration,
  parseBotTeamTemplateDeclaration,
  parseBotTemplateDeclaration,
  parseCatalogEntryIdentity,
  parseCatalogSlug,
  parseCatalogUuid,
  parseMcpServerDeclaration,
  parseSkillDeclaration,
} from './catalog-templates.js';

const SKILL_ID = '11111111-1111-4111-8111-111111111111';
const BOT_TEMPLATE_ID = '22222222-2222-4222-8222-222222222222';
const MCP_ENTRY_ID = '33333333-3333-4333-8333-333333333333';

describe('catalog identity', () => {
  it('mints UUID catalog ids', () => {
    const id = newCatalogId();
    expect(isCatalogUuid(id)).toBe(true);
    expect(parseCatalogUuid(id).ok).toBe(true);
  });

  it('accepts kebab slugs and rejects invalid ones', () => {
    expect(isCatalogSlug('flight-researcher')).toBe(true);
    expect(parseCatalogSlug('Flight').ok).toBe(false);
    expect(parseCatalogSlug('1bad').ok).toBe(false);
    expect(parseCatalogSlug('').ok).toBe(false);
  });

  it('parses catalog entry identity with uuid id and slug', () => {
    const result = parseCatalogEntryIdentity({
      id: BOT_TEMPLATE_ID,
      slug: 'flight-researcher',
      entryType: 'bot-template',
      version: '1',
      publisherKind: 'builtin',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe(BOT_TEMPLATE_ID);
      expect(result.value.slug).toBe('flight-researcher');
    }
  });

  it('rejects slug as catalog entry id', () => {
    expect(
      parseCatalogEntryIdentity({
        id: 'flight-researcher',
        slug: 'flight-researcher',
        entryType: 'bot-template',
        version: '1',
        publisherKind: 'builtin',
      }).ok,
    ).toBe(false);
  });
});

describe('secret rejection', () => {
  it('rejects credential fields nested in declarations', () => {
    const result = assertNoSecretsInDeclaration({
      name: 'ok',
      nested: { credential_ref: 'secret' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('credential_ref');
    }
  });

  it('rejects connectionId on bot templates', () => {
    expect(
      parseBotTemplateDeclaration({
        name: 'Coder',
        title: 'Coder',
        instruction: 'Implement work.',
        skillIds: [],
        capabilityReqs: [],
        neverList: [],
        connectionId: 'conn-1',
      }).ok,
    ).toBe(false);
  });
});

describe('template declarations', () => {
  it('requires skill and bot-template refs to be UUIDs not slugs', () => {
    expect(
      parseBotTemplateDeclaration({
        name: 'Monitor',
        title: 'Monitor',
        instruction: 'Watch systems.',
        skillIds: ['brief'],
        capabilityReqs: [],
        neverList: [],
      }).ok,
    ).toBe(false);

    const ok = parseBotTemplateDeclaration({
      name: 'Monitor',
      title: 'Monitor',
      instruction: 'Watch systems.',
      skillIds: [SKILL_ID],
      capabilityReqs: [
        {
          capability: 'mcp.echo',
          catalogEntryId: MCP_ENTRY_ID,
          resourceHint: 'echo',
        },
      ],
      neverList: ['Never page humans without evidence.'],
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.value.skillIds).toEqual([SKILL_ID]);
      expect(ok.value.capabilityReqs[0]?.catalogEntryId).toBe(MCP_ENTRY_ID);
    }
  });

  it('requires team members to reference bot-template UUIDs', () => {
    expect(
      parseBotTeamTemplateDeclaration({
        name: 'Ops',
        description: 'Incident team',
        members: [{ botTemplateId: 'monitor', role: 'watcher' }],
      }).ok,
    ).toBe(false);

    const ok = parseBotTeamTemplateDeclaration({
      name: 'Ops',
      description: 'Incident team',
      members: [{ botTemplateId: BOT_TEMPLATE_ID, role: 'watcher' }],
    });
    expect(ok.ok).toBe(true);
  });

  it('parses skill and mcp declarations without secrets', () => {
    expect(
      parseSkillDeclaration({
        title: 'Brief',
        summary: 'Three bullets',
        instructions: 'Write three bullets.',
        capabilityReqs: [],
      }).ok,
    ).toBe(true);

    expect(
      parseMcpServerDeclaration({
        title: 'Mock',
        summary: 'Echo',
        transportUrlPattern: 'https://mcp.example/mcp',
        serverName: 'mock',
      }).ok,
    ).toBe(true);

    expect(
      parseMcpServerDeclaration({
        title: 'Mock',
        summary: 'Echo',
        transportUrlPattern: 'https://user:pass@mcp.example/mcp',
        serverName: 'mock',
      }).ok,
    ).toBe(false);
  });
});

describe('install checklist', () => {
  it('reports missing connect and grant before ready', () => {
    const missing = buildInstallChecklist(
      [{ capability: 'mcp.echo', catalogEntryId: MCP_ENTRY_ID }],
      new Map(),
    );
    expect(missing.ready).toBe(false);
    expect(missing.items[0]).toMatchObject({ kind: 'missingConnect', capability: 'mcp.echo' });

    const needGrant = buildInstallChecklist(
      [{ capability: 'mcp.echo', resourceHint: 'echo' }],
      new Map([['mcp.echo', { admitted: true, installed: true, connected: true, granted: false }]]),
    );
    expect(needGrant.ready).toBe(false);
    expect(needGrant.items[0]?.kind).toBe('missingGrant');

    const ready = buildInstallChecklist(
      [{ capability: 'mcp.echo' }],
      new Map([['mcp.echo', { admitted: true, installed: true, connected: true, granted: true }]]),
    );
    expect(ready.ready).toBe(true);
    expect(ready.items).toEqual([{ kind: 'ready' }]);
  });
});

describe('MCP wire names and A2A skill ids', () => {
  it('builds mcp__{slug}__{tool} wire names from the server slug', () => {
    expect(mcpToolWireName('mock', 'echo')).toBe('mcp__mock__echo');
  });

  it('does not treat A2A card skill ids as gabot Skill row ids', () => {
    const a2a = parseA2AAgentDeclaration({
      title: 'Mastra',
      summary: 'Coworker',
      agentCardUrl: 'https://agent.example/.well-known/agent-card.json',
      trustTier: 'workspace',
      remoteSkillIds: ['general', 'research'],
    });
    expect(a2a.ok).toBe(true);
    if (a2a.ok) {
      for (const remoteId of a2a.value.remoteSkillIds) {
        expect(looksLikeGabotSkillRowId(remoteId)).toBe(false);
        expect(isCatalogSlug(remoteId)).toBe(true);
      }
    }
    expect(looksLikeGabotSkillRowId(SKILL_ID)).toBe(true);
  });
});
