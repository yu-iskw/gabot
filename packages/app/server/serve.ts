import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadWorkspaceDirectory,
  proxyApiRequest,
  toPublicWorkspaceListing,
  WORKSPACE_SLUG_HEADER,
} from './workspace-proxy.js';

const here = dirname(fileURLToPath(import.meta.url));
const directoryPath =
  process.env.GABOT_WORKSPACE_DIRECTORY ?? join(here, '..', 'workspace-directory.json');
const directory = loadWorkspaceDirectory(directoryPath);
const port = Number.parseInt(process.env.PORT ?? '3010', 10);

const app = new Hono();

app.get('/workspace-directory.json', (context) =>
  context.json(toPublicWorkspaceListing(directory)),
);

app.all('/api/*', async (context) => {
  const method = context.req.method;
  const body = method === 'GET' || method === 'HEAD' ? undefined : await context.req.arrayBuffer();
  const response = await proxyApiRequest({
    directory,
    slugHeader: context.req.header(WORKSPACE_SLUG_HEADER),
    method,
    path: context.req.path,
    search: new URL(context.req.url).search,
    headers: context.req.raw.headers,
    body,
  });
  return new Response(response.body, { status: response.status, headers: response.headers });
});

app.use('/*', serveStatic({ root: './dist' }));
app.get('*', serveStatic({ path: './dist/index.html' }));

serve({ fetch: app.fetch, port });
console.info(`gabot-app listening on ${String(port)} directory=${directoryPath}`);
