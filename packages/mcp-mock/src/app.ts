import { asRecord, asString } from '@gabot/common';
import { Hono } from 'hono';

export function createMcpMockApp(): Hono {
  const app = new Hono();
  app.get('/health', (context) => context.json({ status: 'ok', role: 'mcp-server' }));
  app.post('/mcp', async (context) => {
    const body = asRecord(await context.req.json());
    const id = typeof body.id === 'number' ? body.id : 1;
    if (body.method === 'tools/list') {
      return context.json({
        jsonrpc: '2.0',
        id,
        result: {
          tools: [
            { name: 'echo', description: 'Echo text' },
            { name: 'search', description: 'Harmless search stub' },
          ],
        },
      });
    }
    if (body.method === 'tools/call') {
      return context.json({
        jsonrpc: '2.0',
        id,
        result: { content: [{ type: 'text', text: callText(body) }] },
      });
    }
    return context.json({ jsonrpc: '2.0', id, error: { message: 'unknown method' } }, 400);
  });
  return app;
}

function callText(body: Record<string, unknown>): string {
  const params = asRecord(body.params);
  const name = asString(params.name);
  const args = asRecord(params.arguments);
  if (name === 'echo') {
    return asString(args.text);
  }
  if (name === 'search') {
    return `search:${asString(args.query)}`;
  }
  return `unknown:${name}`;
}
