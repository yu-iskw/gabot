import { matchesToken, offeredBearer } from '@gabot/common';
import { Hono } from 'hono';

type ComputerRecord = {
  botId: string;
  url: string;
  status: 'running' | 'stopped';
};

export function createSupervisorApp(token: string, computerUrl: string): Hono {
  if (!token) {
    throw new Error('SUPERVISOR_TOKEN is required.');
  }
  const computers = new Map<string, ComputerRecord>();
  const app = new Hono();
  app.get('/health', (context) => context.json({ status: 'ok', role: 'supervisor' }));
  app.use('*', async (context, next) => {
    if (context.req.path === '/health') {
      return next();
    }
    if (!matchesToken(token, offeredBearer(context.req.header('authorization')))) {
      return context.json({ error: 'Unauthorized' }, 401);
    }
    return next();
  });
  app.get('/computers', (context) => context.json({ computers: [...computers.values()] }));
  app.post('/computers/:botId/ensure', (context) => {
    const botId = context.req.param('botId');
    const record: ComputerRecord = { botId, url: computerUrl, status: 'running' };
    computers.set(botId, record);
    return context.json(record);
  });
  app.post('/computers/:botId/stop', (context) => {
    const botId = context.req.param('botId');
    const record = computers.get(botId) ?? { botId, url: computerUrl, status: 'stopped' as const };
    record.status = 'stopped';
    computers.set(botId, record);
    return context.json(record);
  });
  app.post('/computers/:botId/reset', (context) => {
    const botId = context.req.param('botId');
    const record: ComputerRecord = { botId, url: computerUrl, status: 'running' };
    computers.set(botId, record);
    return context.json(record);
  });
  return app;
}
