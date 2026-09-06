import { describe, expect, it } from 'vitest';

import { parseScopedResourceRef, scopedResourceEquals, scopedResourceKey } from './resource-ref.js';

const LOCAL_CHANNEL = {
  localId: 'ch-general',
  resourceType: 'channel',
  workspaceId: 'ws-1',
} as const;

const LOCAL_AGENT = {
  localId: 'coder',
  resourceType: 'agent',
  workspaceId: 'ws-1',
} as const;

describe('scoped resource references', () => {
  it('distinguishes two origins with identical local resource ids', () => {
    const engineering = parseScopedResourceRef({
      backendId: 'backend-engineering',
      origin: 'https://engineering.example',
      ...LOCAL_CHANNEL,
    });
    const payments = parseScopedResourceRef({
      backendId: 'backend-payments',
      origin: 'https://payments.example',
      ...LOCAL_CHANNEL,
    });
    expect(engineering.ok && payments.ok).toBe(true);
    if (engineering.ok && payments.ok) {
      expect(engineering.value.localId).toBe(payments.value.localId);
      expect(engineering.value.workspaceId).toBe(payments.value.workspaceId);
      expect(scopedResourceEquals(engineering.value, payments.value)).toBe(false);
      expect(scopedResourceKey(engineering.value)).not.toBe(scopedResourceKey(payments.value));
    }
  });

  it('keeps identical agent ids on different backends distinct', () => {
    const engineering = parseScopedResourceRef({
      backendId: 'backend-engineering',
      origin: 'https://engineering.example',
      ...LOCAL_AGENT,
    });
    const payments = parseScopedResourceRef({
      backendId: 'backend-payments',
      origin: 'https://payments.example',
      ...LOCAL_AGENT,
    });
    expect(engineering.ok && payments.ok).toBe(true);
    if (engineering.ok && payments.ok) {
      expect(scopedResourceKey(engineering.value)).not.toBe(scopedResourceKey(payments.value));
    }
  });

  it('equals refs that share origin backend workspace type and local id', () => {
    const left = parseScopedResourceRef({
      backendId: 'backend-engineering',
      origin: 'https://engineering.example/',
      ...LOCAL_CHANNEL,
    });
    const right = parseScopedResourceRef({
      backendId: 'backend-engineering',
      origin: 'https://engineering.example',
      ...LOCAL_CHANNEL,
    });
    expect(left.ok && right.ok).toBe(true);
    if (left.ok && right.ok) {
      expect(scopedResourceEquals(left.value, right.value)).toBe(true);
    }
  });

  it('rejects an origin that includes a path', () => {
    const result = parseScopedResourceRef({
      backendId: 'backend-engineering',
      localId: 'ch-general',
      origin: 'https://engineering.example/api',
      resourceType: 'channel',
      workspaceId: 'ws-1',
    });
    expect(result.ok).toBe(false);
  });
});
