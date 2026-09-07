import {
  aguiEventsToSse,
  asRecord,
  asString,
  createMastraAgentCard,
  isMainModule,
} from '@gabot/common';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import postgres from 'postgres';

import { resolveMastraModel, runMastraAsAgui, type MastraModelRef } from './mastra-run.js';

import type { AguiEvent, AguiRunInput } from '@gabot/common';

// Cloud Run: --functional-type=agent --identity-type=agent-identity (immutable).
// Mastra A2A task store is in-memory; durable hops use AlloyDB work_items.

export const MASTRA_INSTRUCTIONS =
  'You are a gabot coworker running on Mastra. Tools execute on the control plane. Never claim to have opened a page without a tool result. When collaborating, call delegate_to_bot with a botId from the tool schema / identity teammate list. Keep auto-collaborating across those bots for as many relay rounds as the user requested. Never invent bot ids.';

export type AgentAppOptions = {
  /** Test seam: bypass Mastra generate with a fixed AG-UI turn. */
  completeTurn?: (input: AguiRunInput) => Promise<AguiEvent[]>;
  mastraModel?: MastraModelRef;
  provider?: string;
  publicUrl: string;
};

export function createAgentApp(options: AgentAppOptions): Hono {
  const provider = options.provider ?? resolveProviderLabel(options.mastraModel);
  const completeTurn =
    options.completeTurn ??
    ((input: AguiRunInput) =>
      runMastraAsAgui({
        input,
        instructions: MASTRA_INSTRUCTIONS,
        model: options.mastraModel ?? resolveMastraModelFromEnv(),
      }));
  const app = new Hono();
  app.get('/health', (context) =>
    context.json({
      status: 'ok',
      framework: 'mastra',
      provider,
      instructions: MASTRA_INSTRUCTIONS.slice(0, 24),
    }),
  );
  app.get('/.well-known/agent-card.json', (context) =>
    context.json(createMastraAgentCard(options.publicUrl)),
  );
  app.post('/ag-ui', async (context) => {
    // Buffer MastraAgent Observable → SSE for the control-plane HTTP runner.
    const events = await completeTurn(readRunInput(await context.req.json()));
    return context.body(aguiEventsToSse(events), 200, { 'content-type': 'text/event-stream' });
  });
  return app;
}

export function resolveMastraModelFromEnv(): MastraModelRef {
  return resolveMastraModel({
    provider: process.env.GABOT_MODEL_PROVIDER,
    projectId: process.env.GOOGLE_VERTEX_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT,
    location: process.env.GOOGLE_VERTEX_LOCATION ?? 'global',
    modelId: process.env.GABOT_VERTEX_MODEL,
    scriptedBaseUrl: process.env.MODEL_BASE_URL ?? 'http://scripted-model:4400/v1',
  });
}

function resolveProviderLabel(model: MastraModelRef | undefined): string {
  if (model) {
    return model.kind;
  }
  const provider = (process.env.GABOT_MODEL_PROVIDER ?? 'mastra-scripted').toLowerCase();
  if (provider === 'vertex' || provider === 'google-vertex') {
    return 'google-vertex';
  }
  return 'mastra-scripted';
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
            toolCalls: readToolCalls(item.toolCalls),
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

function readToolCalls(value: unknown): AguiRunInput['messages'][number]['toolCalls'] {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const calls = value
    .map((entry) => readOneToolCall(asRecord(entry)))
    .filter((call): call is NonNullable<typeof call> => call !== undefined);
  return calls.length > 0 ? calls : undefined;
}

function readOneToolCall(
  item: Record<string, unknown>,
): { arguments: Record<string, unknown>; id: string; name: string } | undefined {
  const fn = asRecord(item.function);
  const name = asString(item.name) || asString(fn.name);
  const id = asString(item.id);
  if (!name || !id) {
    return undefined;
  }
  return { id, name, arguments: readCallArguments(item, fn) };
}

function readCallArguments(
  item: Record<string, unknown>,
  fn: Record<string, unknown>,
): Record<string, unknown> {
  if (item.arguments && typeof item.arguments === 'object' && !Array.isArray(item.arguments)) {
    return item.arguments as Record<string, unknown>;
  }
  if (typeof fn.arguments !== 'string') {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(fn.arguments);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }
  return {};
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
    publicUrl: process.env.PUBLIC_URL ?? `http://127.0.0.1:${String(port)}`,
  });
  if (process.env.DATABASE_URL) {
    await initMastraStore(process.env.DATABASE_URL);
  }
  serve({ fetch: app.fetch, port });
  console.info(`mastra-agent listening on ${String(port)}`);
}
