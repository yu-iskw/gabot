import { serve } from '@hono/node-server';

import { createSupervisorApp } from './app.js';

const token = process.env.SUPERVISOR_TOKEN?.trim();
if (!token) {
  console.error('SUPERVISOR_TOKEN is not set.');
  process.exit(1);
}

const port = Number.parseInt(process.env.PORT ?? '4500', 10);
const app = createSupervisorApp(token, process.env.COMPUTER_URL ?? 'http://computer:4100');
serve({ fetch: app.fetch, port });
console.info(`supervisor listening on ${String(port)}`);
