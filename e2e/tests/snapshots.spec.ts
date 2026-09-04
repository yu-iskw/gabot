import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

const EMAIL = 'admin@example.com';

async function signIn(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByTestId('user-email')).toHaveText(EMAIL);
}

async function shot(page: Page, dir: string, file: string): Promise<void> {
  await page.screenshot({ path: path.join(dir, file), fullPage: true });
}

async function sendPrompt(page: Page, message: string, reply: RegExp): Promise<void> {
  await page.locator('textarea[name="prompt"]').fill(message);
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByTestId('assistant-reply')).toContainText(reply, { timeout: 60_000 });
}

test('snapshots OpenBot-equivalent screens and use cases', async ({ page }) => {
  const dir = path.join(import.meta.dirname, '../screenshots');
  await mkdir(dir, { recursive: true });

  await page.goto('/');
  await shot(page, dir, '01-sign.png');

  await signIn(page);
  await shot(page, dir, '02-home.png');

  await page.goto('/channel/general');
  await shot(page, dir, '03-channel-empty.png');

  await page.goto('/channel/general?watch=true');
  await expect(page.getByTestId('computer-view')).toBeVisible();
  await shot(page, dir, '25-channel-watch-empty.png');

  await page.goto('/channel/general?settings=true');
  await expect(page.getByTestId('agent-profile')).toBeVisible();
  await shot(page, dir, '27-channel-settings-url.png');

  await page.goto('/channel/general');
  await page.getByLabel('Message').click();
  await page.keyboard.type('/');
  await shot(page, dir, '26-composer-slash.png');
  await page.locator('textarea[name="prompt"]').fill('');

  await sendPrompt(page, 'please create a bot named Research', /Research/i);
  await shot(page, dir, '04-channel-create-bot.png');
  await page.getByRole('link', { name: 'Agents' }).click();
  await expect(page.locator('main').getByText('Research').first()).toBeVisible();
  await shot(page, dir, '05-agents-after-create.png');

  await page.getByTestId('channel-general').click();
  await sendPrompt(page, 'schedule a task every minute to say hello', /Scheduled/i);
  await shot(page, dir, '06-channel-schedule.png');
  await page.getByRole('link', { name: 'Routines' }).click();
  await expect(page.getByText('say hello').first()).toBeVisible();
  await shot(page, dir, '07-routines-after-schedule.png');

  await page.goto('/channel/general?watch=true');
  await sendPrompt(page, 'please navigate to example.com', /example.com/i);
  await expect(page.getByTestId('audit-events')).toContainText('Opened');
  await shot(page, dir, '08-channel-computer.png');

  const rest: Array<[string, string]> = [
    ['/skills', '09-skills.png'],
    ['/admin', '10-admin.png'],
    ['/admin/audit', '11-admin-audit.png'],
    ['/admin/boundaries', '12-admin-boundaries.png'],
    ['/admin/computers', '13-admin-computers.png'],
    ['/admin/plugins', '14-admin-plugins.png'],
    ['/admin/people', '15-admin-people.png'],
    ['/admin/credentials', '16-admin-credentials.png'],
    ['/admin/identity-providers', '17-admin-identity.png'],
    ['/settings', '18-settings.png'],
  ];
  for (const [route, file] of rest) {
    await page.goto(route);
    await expect(page.getByTestId('user-email')).toHaveText(EMAIL);
    await expect(page.locator('main h1')).toBeVisible();
    await shot(page, dir, file);
  }

  await page.getByRole('switch', { name: 'Dark theme' }).click();
  await shot(page, dir, '19-settings-dark.png');

  await page.goto('/admin/plugins/mock');
  await expect(page.getByTestId('user-email')).toHaveText(EMAIL);
  await expect(page.locator('main h1')).toHaveText('Mock MCP');
  await shot(page, dir, '20-plugin-detail.png');

  await page.goto('/admin/plugins/mock/tools/echo');
  await expect(page.locator('main h1')).toHaveText('echo');
  await shot(page, dir, '21-plugin-tool.png');

  await page.getByRole('link', { name: 'Agents' }).click();
  await page
    .getByRole('button', { name: /Research/ })
    .first()
    .click();
  await expect(page.getByTestId('agent-profile')).toBeVisible();
  await shot(page, dir, '22-agent-profile.png');

  await page.getByTestId('channel-general').click();
  await page.getByRole('button', { name: 'Channel coworker' }).click();
  await expect(page.getByTestId('agent-profile')).toBeVisible();
  await shot(page, dir, '23-channel-settings.png');

  await page.getByRole('button', { name: "Watch this Bot's screen" }).click();
  await sendPrompt(page, 'please echo hello via mcp', /grant|refus/i);
  await expect(page.getByTestId('audit-events')).toContainText('Blocked');
  await shot(page, dir, '24-mcp-refused.png');
});
