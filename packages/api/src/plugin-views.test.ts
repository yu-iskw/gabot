import { describe, expect, it } from 'vitest';

import { getPluginDetail, listPluginViews } from './plugin-views.js';
import { MemoryStore } from './store/memory-store.js';

describe('plugin views', () => {
  it('counts tools and granted bots on the catalogue', async () => {
    const store = new MemoryStore();
    const listed = await listPluginViews(store);
    expect(listed).toEqual([
      expect.objectContaining({
        id: 'mock',
        title: 'Mock MCP',
        toolCount: 2,
        botCount: 0,
      }),
    ]);
  });

  it('lists which bots hold each tool', async () => {
    const store = new MemoryStore();
    await store.setGrant({
      kind: 'mcp',
      ref: 'mock/echo',
      agentId: 'general-assistant',
      granted: true,
      grantedBy: 'admin',
    });
    const detail = await getPluginDetail(store, 'mock');
    expect(detail?.tools.find((tool) => tool.name === 'echo')?.grantedTo).toEqual([
      'general-assistant',
    ]);
    expect(await getPluginDetail(store, 'missing')).toBeNull();
  });
});
