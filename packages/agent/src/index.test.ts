import { EventType } from '@ag-ui/core';
import { isA2AAgentCard } from '@gabot/common';
import { describe, expect, it } from 'vitest';

import { createAgentApp, MASTRA_INSTRUCTIONS } from './index.js';

describe('mastra agent', () => {
  it('serves an A2A agent card', async () => {
    const app = createAgentApp({ publicUrl: 'http://agent:4200' });
    const response = await app.request('/.well-known/agent-card.json');
    const card: unknown = await response.json();
    expect(isA2AAgentCard(card)).toBe(true);
    expect(MASTRA_INSTRUCTIONS).toContain('Mastra');
    expect(MASTRA_INSTRUCTIONS).toContain('tool schema / identity teammate list');
    expect(MASTRA_INSTRUCTIONS).not.toMatch(/exactly one of monitor/);
  });

  it('streams AG-UI from a Mastra completeTurn seam', async () => {
    const app = createAgentApp({
      publicUrl: 'http://agent:4200',
      completeTurn: (input) =>
        Promise.resolve([
          { type: EventType.RUN_STARTED, threadId: input.threadId, runId: input.runId },
          { type: EventType.TEXT_MESSAGE_START, messageId: 'm1', role: 'assistant' },
          { type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'm1', delta: 'Hello from gabot.' },
          { type: EventType.TEXT_MESSAGE_END, messageId: 'm1' },
          { type: EventType.RUN_FINISHED, threadId: input.threadId, runId: input.runId },
        ]),
    });
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
  });
});
