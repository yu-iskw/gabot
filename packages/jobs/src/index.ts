import { serve } from '@hono/node-server';
import postgres from 'postgres';

import { createJobsApp, runTick } from './jobs.js';

const port = Number.parseInt(process.env.PORT ?? '4600', 10);
const databaseUrl = process.env.DATABASE_URL;
const sql = databaseUrl ? postgres(databaseUrl, { max: 4 }) : undefined;

const tick = async () => {
  if (!sql) {
    return { claimed: 0, routines: 0 };
  }
  return runTick({
    sql,
    apiUrl: process.env.API_INTERNAL_URL ?? 'http://api:3001',
    secret: process.env.WORKER_SHARED_SECRET ?? 'gabot-dev-worker-secret',
    workerId: process.env.HOSTNAME ?? 'jobs',
  });
};

const app = createJobsApp(tick);
serve({ fetch: app.fetch, port });
console.info(`jobs listening on ${String(port)}`);
