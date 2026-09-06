import {
  aguiEventsToSse,
  asRecord,
  asString,
  createMastraAgentCard,
  createOpenAiCompatibleModel,
  isMainModule,
  runModelAsAgui,
} from '@gabot/common';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import postgres from 'postgres';

import type { AguiRunInput } from '@gabot/common';

// Cloud Run: --functional-type=agent --identity-type=agent-identity (immutable).
// Mastra A2A task store is in-memory; durable hops use AlloyDB work_items.

export const MASTRA_INSTRUCTIONS =
  'You are a gabot coworker running on Mastra. Tools execute on the control plane. Never claim to have opened a page without a tool result.';

export function createAgentApp(options: { modelBaseUrl: string; publicUrl: string }): Hono {
  const app = new Hono();
  const model = createOpenAiCompatibleModel(options.modelBaseUrl);
  app.get('/health', (context) =>
    context.json({
      status: 'ok',
      framework: 'mastra',
      instructions: MASTRA_INSTRUCTIONS.slice(0, 24),
    }),
  );
  app.get('/.well-known/agent-card.json', (context) =>
    context.json(createMastraAgentCard(options.publicUrl)),
  );
  app.post('/ag-ui', async (context) => {
    const events = await runModelAsAgui(model, readRunInput(await context.req.json()));
    return context.body(aguiEventsToSse(events), 200, { 'content-type': 'text/event-stream' });
  });
  return app;
}

function readRunInput(value: unknown): AguiRunInput {
  const record = asRecord(value);
  return {
    threadId: asString(record.threadId),
    runId: asString(record.runId),
    messages: Array.isArray(record.messages)
      ? record.messages.map((message) => {
          const item = asRecord(message);
          return {
            role: messageRole(asString(item.role)),
            content: asString(item.content),
            toolCallId: asString(item.toolCallId) || undefined,
            toolName: asString(item.toolName) || undefined,
          };
        })
      : [],
    tools: Array.isArray(record.tools)
      ? record.tools.map((tool) => {
          const item = asRecord(tool);
          return {
            name: asString(item.name),
            description: asString(item.description),
            parameters: asRecord(item.parameters),
          };
        })
      : [],
  };
}

function messageRole(value: string): AguiRunInput['messages'][number]['role'] {
  if (value === 'assistant' || value === 'tool' || value === 'system' || value === 'user') {
    return value;
  }
  return 'user';
}

export async function initMastraStore(databaseUrl: string): Promise<void> {
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    await sql`
      INSERT INTO mastra_threads (id, resource_id, title)
      VALUES ('agent-runtime', 'mastra', 'PostgresStore')
      ON CONFLICT (id) DO NOTHING
    `;
  } finally {
    await sql.end();
  }
}

const port = Number.parseInt(process.env.PORT ?? '4200', 10);
if (isMainModule(import.meta.url)) {
  const app = createAgentApp({
    modelBaseUrl: process.env.MODEL_BASE_URL ?? 'http://scripted-model:4400/v1',
    publicUrl: process.env.PUBLIC_URL ?? `http://127.0.0.1:${String(port)}`,
  });
  if (process.env.DATABASE_URL) {
    await initMastraStore(process.env.DATABASE_URL);
  }
  serve({ fetch: app.fetch, port });
  console.info(`mastra-agent listening on ${String(port)}`);
}
