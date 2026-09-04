import { serve } from '@hono/node-server';

import { createComputerApp } from './app.js';
import { createChromiumDriver } from './chromium-driver.js';

// Cloud Run: this is an instance with --sandbox-launcher, not --functional-type.

const token = process.env.COMPUTER_TOKEN?.trim();
if (!token) {
  console.error('COMPUTER_TOKEN is not set.');
  process.exit(1);
}

const port = Number.parseInt(process.env.PORT ?? '4100', 10);
const driver = await createChromiumDriver();
const app = createComputerApp(token, driver);
serve({ fetch: app.fetch, port });
console.info(`computer listening on ${String(port)}`);
