import { workspaceDefaultChannelId } from '@gabot/common';
import { describe, expect, it } from 'vitest';

import { MemoryStore } from './memory-store.js';

import type { VerifiedPerson } from '@gabot/common';

const issuer = 'https://id.test/gabot';

function person(id: string, email: string): VerifiedPerson {
  return { id, email, name: id, identity: { issuer, subject: id } };
}

describe('workspace membership store', () => {
  it('returns no workspace until the principal has active membership', async () => {
    const store = new MemoryStore();
    const admin = person('user-1', 'admin@example.com');
    const other = person('user-2', 'other@example.com');
    await store.upsertUser(other, []);
    expect(await store.getWorkspaceForUser(other.id)).toBeNull();
    await store.upsertUser(admin, [admin.identity]);
    expect((await store.getWorkspaceForUser(admin.id))?.id).toBe('ws-gabot');
    await store.upsertMembership({ userId: other.id, role: 'member', status: 'active' });
    expect((await store.getWorkspaceForUser(other.id))?.id).toBe('ws-gabot');
  });

  it('hides the workspace after membership is revoked', async () => {
    const store = new MemoryStore();
    const admin = person('user-1', 'admin@example.com');
    const other = person('user-2', 'other@example.com');
    await store.upsertUser(admin, [admin.identity]);
    await store.upsertUser(other, []);
    await store.upsertMembership({ userId: other.id, role: 'member', status: 'active' });
    await store.upsertMembership({ userId: other.id, role: 'member', status: 'revoked' });
    expect(await store.getWorkspaceForUser(other.id)).toBeNull();
    expect((await store.getMembership(other.id))?.status).toBe('revoked');
    expect(await store.listChannels(other.id)).toEqual([]);
    expect(await store.getChannel(workspaceDefaultChannelId('ws-gabot'), other.id)).toBeNull();
  });
});
