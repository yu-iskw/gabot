import { serve } from '@hono/node-server';

import { createMcpMockApp } from './app.js';

// Cloud Run: --functional-type=mcp-server (immutable).

const port = Number.parseInt(process.env.PORT ?? '4300', 10);
serve({ fetch: createMcpMockApp().fetch, port });
console.info(`mcp-mock listening on ${String(port)}`);
