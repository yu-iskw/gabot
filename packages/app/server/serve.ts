import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';

const apiProxy = process.env.VITE_API_PROXY ?? 'http://api:3001';
const port = Number.parseInt(process.env.PORT ?? '3010', 10);

const app = new Hono();

app.all('/api/*', async (context) => {
  const url = new URL(context.req.path, apiProxy);
  url.search = new URL(context.req.url).search;
  const headers = new Headers(context.req.raw.headers);
  headers.delete('host');
  const method = context.req.method;
  const body = method === 'GET' || method === 'HEAD' ? undefined : await context.req.arrayBuffer();
  const response = await fetch(url, { method, headers, body });
  return new Response(response.body, { status: response.status, headers: response.headers });
});

app.use('/*', serveStatic({ root: './dist' }));
app.get('*', serveStatic({ path: './dist/index.html' }));

serve({ fetch: app.fetch, port });
console.info(`gabot-app listening on ${String(port)}`);
