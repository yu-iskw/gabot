import { CAPABILITY_MCP_ECHO, PROVIDER_MOCK_MCP, RESOURCE_MCP_ECHO } from '@gabot/common';
import { describe, expect, it } from 'vitest';

import { getPluginDetail, listPluginViews } from './plugin-views.js';
import { MemoryStore } from './store/memory-store.js';

const person = { id: 'user-1', email: 'admin@example.com', name: 'Admin' };

describe('plugin views', () => {
  it('counts tools and workspace grants on the catalogue', async () => {
    const store = new MemoryStore();
    await store.upsertUser(person, ['admin@example.com']);
    const workspace = await store.getWorkspaceForUser(person.id);
    if (!workspace) {
      throw new Error('workspace missing');
    }
    const listed = await listPluginViews(store, workspace);
    expect(listed).toEqual([
      expect.objectContaining({
        id: 'mock',
        title: 'Mock MCP',
        toolCount: 2,
        grantedCount: 0,
      }),
    ]);
  });

  it('shows whether the workspace holds each tool', async () => {
    const store = new MemoryStore();
    await store.upsertUser(person, ['admin@example.com']);
    const workspace = await store.getWorkspaceForUser(person.id);
    if (!workspace) {
      throw new Error('workspace missing');
    }
    await store.setCapabilityGrant({
      workspaceId: workspace.id,
      ownerUserId: workspace.ownerUserId,
      provider: PROVIDER_MOCK_MCP,
      capability: CAPABILITY_MCP_ECHO,
      resource: RESOURCE_MCP_ECHO,
      granted: true,
      grantedBy: 'admin',
    });
    const detail = await getPluginDetail(store, 'mock', workspace);
    expect(detail?.tools.find((tool) => tool.name === 'echo')?.granted).toBe(true);
    expect(await getPluginDetail(store, 'missing', workspace)).toBeNull();
  });
});
