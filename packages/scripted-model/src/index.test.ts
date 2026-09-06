import { decideScriptedTurn } from '@gabot/common';
import { describe, expect, it } from 'vitest';

import { createScriptedModelApp } from './index.js';

describe('scripted model HTTP', () => {
  it('returns an MCP echo tool call for echo prompts', async () => {
    const app = createScriptedModelApp();
    const response = await app.request('/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'please echo hello via mcp' }],
      }),
    });
    const body = (await response.json()) as {
      choices: Array<{ message: { tool_calls?: Array<{ function: { name: string } }> } }>;
    };
    expect(body.choices[0]?.message.tool_calls?.[0]?.function.name).toBe('mcp__mock__echo');
    expect(decideScriptedTurn([{ role: 'user', content: 'hi' }]).text).toContain('gabot');
  });
});
