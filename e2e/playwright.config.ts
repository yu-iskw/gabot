import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  workers: 1,
  use: {
    baseURL: process.env.GABOT_APP_URL ?? 'http://127.0.0.1:3010',
    trace: 'on-first-retry',
  },
});
