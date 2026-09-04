import { asRecord, asString, decideScriptedTurn, isMainModule } from '@gabot/common';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';

import type { ChatMessage } from '@gabot/common';

export function createScriptedModelApp(): Hono {
  const app = new Hono();
  app.get('/health', (context) => context.json({ status: 'ok', model: 'scripted' }));
  app.post('/v1/chat/completions', async (context) => {
    const body = asRecord(await context.req.json());
    const rawMessages = Array.isArray(body.messages) ? body.messages : [];
    const messages: ChatMessage[] = rawMessages.map((message) => {
      const item = asRecord(message);
      return {
        role: roleOf(asString(item.role)),
        content: asString(item.content),
        toolCallId: asString(item.tool_call_id) || undefined,
        toolName: asString(item.name) || undefined,
      };
    });
    const turn = decideScriptedTurn(messages);
    const toolCalls = turn.toolCalls.map((call) => ({
      id: call.id,
      type: 'function',
      function: { name: call.name, arguments: JSON.stringify(call.arguments) },
    }));
    return context.json({
      choices: [
        {
          message: {
            role: 'assistant',
            content: turn.text || null,
            tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
          },
        },
      ],
    });
  });
  return app;
}

function roleOf(role: string): ChatMessage['role'] {
  if (role === 'assistant' || role === 'tool' || role === 'system') {
    return role;
  }
  return 'user';
}

const port = Number.parseInt(process.env.PORT ?? '4400', 10);
if (isMainModule(import.meta.url)) {
  serve({ fetch: createScriptedModelApp().fetch, port });
  console.info(`scripted-model listening on ${String(port)}`);
}
