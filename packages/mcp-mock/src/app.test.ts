import { describe, expect, it } from 'vitest';

import { createMcpMockApp } from './app.js';

describe('mcp mock', () => {
  it('lists and calls echo', async () => {
    const app = createMcpMockApp();
    const listed = await app.request('/mcp', {
      method: 'POST',
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    const listedBody = (await listed.json()) as { result: { tools: Array<{ name: string }> } };
    expect(listedBody.result.tools.map((tool) => tool.name)).toContain('echo');
    const echoed = await app.request('/mcp', {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'echo', arguments: { text: 'hello' } },
      }),
    });
    expect(await echoed.json()).toMatchObject({ result: { content: [{ text: 'hello' }] } });
    const search = await app.request('/mcp', {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'search', arguments: { query: 'q' } },
      }),
    });
    expect(await search.json()).toMatchObject({ result: { content: [{ text: 'search:q' }] } });
    const unknown = await app.request('/mcp', {
      method: 'POST',
      body: JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'nope' }),
    });
    expect(unknown.status).toBe(400);
    expect((await app.request('/health')).status).toBe(200);
  });
});
