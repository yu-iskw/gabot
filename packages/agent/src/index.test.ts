import { isA2AAgentCard } from '@gabot/common';
import { describe, expect, it, vi } from 'vitest';

import { createAgentApp, MASTRA_INSTRUCTIONS } from './index.js';

describe('mastra agent', () => {
  it('serves an A2A agent card', async () => {
    const app = createAgentApp({ modelBaseUrl: 'http://model/v1', publicUrl: 'http://agent:4200' });
    const response = await app.request('/.well-known/agent-card.json');
    const card: unknown = await response.json();
    expect(isA2AAgentCard(card)).toBe(true);
    expect(MASTRA_INSTRUCTIONS).toContain('Mastra');
  });

  it('streams AG-UI from the model port', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: 'Hello from gabot.', tool_calls: [] } }],
          }),
      }),
    );
    const app = createAgentApp({ modelBaseUrl: 'http://model/v1', publicUrl: 'http://agent:4200' });
    const response = await app.request('/ag-ui', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        threadId: 't',
        runId: 'r',
        messages: [{ role: 'user', content: 'hi' }],
        tools: [],
      }),
    });
    const payload = await response.text();
    expect(payload).toContain('TEXT_MESSAGE_CONTENT');
    vi.unstubAllGlobals();
  });
});
