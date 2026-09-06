import { describe, expect, it } from 'vitest';

import { createLocalAgentIdentity, spiffePrincipal } from './local-identity.js';
import { createStaticRegistry } from './static-registry.js';

describe('createLocalAgentIdentity', () => {
  it('signs and verifies a service token', () => {
    const identity = createLocalAgentIdentity('test-secret');
    const token = identity.signServiceToken('http://api.local', 'mastra-agent');
    const verified = identity.verifyServiceToken(token, 'http://api.local');
    expect(verified.serviceName).toBe('mastra-agent');
    expect(verified.principal).toBe(identity.principal('mastra-agent'));
    expect(verified.principal).toContain('services/mastra-agent');
  });

  it('rejects a token for another audience', () => {
    const identity = createLocalAgentIdentity('test-secret');
    const token = identity.signServiceToken('http://api.local', 'mastra-agent');
    expect(() => identity.verifyServiceToken(token, 'http://other')).toThrow('audience');
  });

  it('rejects a tampered token', () => {
    const identity = createLocalAgentIdentity('test-secret');
    const token = identity.signServiceToken('http://api.local', 'mastra-agent');
    expect(() => identity.verifyServiceToken(`${token}x`, 'http://api.local')).toThrow();
  });

  it('rejects an empty secret', () => {
    expect(() => createLocalAgentIdentity('')).toThrow('required');
  });
});

describe('spiffePrincipal', () => {
  it('uses the project-shaped trust domain locally', () => {
    expect(spiffePrincipal('gabot-api', 'demo')).toContain('project-demo');
  });
});

describe('createStaticRegistry', () => {
  it('returns a copy of entries', () => {
    const registry = createStaticRegistry([
      {
        id: 'general-assistant',
        kind: 'agent',
        url: 'http://agent:4200',
        displayName: 'General Assistant',
      },
    ]);
    const listed = registry.list();
    listed.pop();
    expect(registry.list()).toHaveLength(1);
  });
});
