import { asRecord, asString, matchesToken, offeredBearer } from '@gabot/common';
import { Hono } from 'hono';

export type ComputerDriver = {
  navigate(url: string): Promise<{ url: string; title: string; text: string }>;
  screenshot(): Promise<{ base64: string; width: number }>;
};

export function createComputerApp(token: string, driver: ComputerDriver): Hono {
  if (!token) {
    throw new Error('COMPUTER_TOKEN is required.');
  }
  const app = new Hono();
  app.get('/health', (context) => context.json({ status: 'ok', role: 'computer' }));
  app.use('*', async (context, next) => {
    if (context.req.path === '/health') {
      return next();
    }
    if (!matchesToken(token, offeredBearer(context.req.header('authorization')))) {
      return context.json({ error: 'Unauthorized' }, 401);
    }
    return next();
  });
  app.post('/navigate', async (context) => {
    const body = asRecord(await context.req.json());
    const url = asString(body.url);
    if (!url) {
      return context.json({ ok: false, error: 'url is required' }, 400);
    }
    const result = await driver.navigate(url);
    return context.json({ ok: true, ...result });
  });
  app.post('/screenshot', async (context) => {
    const result = await driver.screenshot();
    return context.json({ ok: true, ...result });
  });
  return app;
}
