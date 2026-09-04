import { chromium } from 'playwright';

import type { ComputerDriver } from './app.js';
import type { Browser, Page } from 'playwright';

const TEXT_LIMIT = 6000;

export async function createChromiumDriver(): Promise<ComputerDriver & { close(): Promise<void> }> {
  const browser: Browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage', '--no-sandbox'],
  });
  const page: Page = await browser.newPage();
  return {
    async navigate(url: string) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      const title = await page.title();
      const text = (await page.innerText('body').catch(() => '')).slice(0, TEXT_LIMIT);
      return { url: page.url(), title, text };
    },
    async screenshot() {
      const buffer = await page.screenshot({ type: 'png' });
      return { base64: buffer.toString('base64'), width: 1280 };
    },
    async close() {
      await browser.close();
    },
  };
}
