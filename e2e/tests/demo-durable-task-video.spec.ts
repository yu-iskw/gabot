/**
 * Headless Playwright recordings for durable-task MVP demos.
 * Run against the Docker-free demo stack (auth emulator + demo-server + Vite).
 *
 * Videos are copied after each test (Playwright finalizes .webm when the page closes).
 */
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Page, type TestInfo } from '@playwright/test';

const EMAIL = 'admin@example.com';
const ARTIFACTS = process.env.DEMO_ARTIFACTS_DIR ?? '/opt/cursor/artifacts';

const pendingPublish = new Map<string, string>();

async function signIn(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByTestId('workspace-locate-gabot').click();
  await expect(page.getByRole('heading', { name: /Sign in to/i })).toBeVisible();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByTestId('user-email')).toHaveText(EMAIL, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Start a durable task' })).toBeVisible();
}

async function startDurableTask(page: Page, objective: string): Promise<void> {
  const editor = page.getByLabel('Message');
  await editor.click();
  await page.keyboard.type(objective);
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Start' }).click();
}

function queuePublish(testInfo: TestInfo, fileName: string): void {
  pendingPublish.set(testInfo.testId, fileName);
}

test.afterEach(({}, testInfo) => {
  const fileName = pendingPublish.get(testInfo.testId);
  pendingPublish.delete(testInfo.testId);
  if (!fileName || (testInfo.status !== 'passed' && testInfo.status !== 'timedOut')) {
    // Still publish on pass; on failure copy if video exists for debugging only when passed assertions.
  }
  if (!fileName) {
    return;
  }
  if (testInfo.status !== 'passed') {
    return;
  }
  mkdirSync(ARTIFACTS, { recursive: true });
  const attached = testInfo.attachments.find(
    (row) => row.name === 'video' && row.path?.endsWith('.webm'),
  );
  let source = attached?.path;
  if (!source) {
    try {
      const name = readdirSync(testInfo.outputDir).find((entry) => entry.endsWith('.webm'));
      source = name ? join(testInfo.outputDir, name) : undefined;
    } catch {
      source = undefined;
    }
  }
  if (!source) {
    console.warn(`No video yet for ${fileName}; skipping publish`);
    return;
  }
  const dest = join(ARTIFACTS, fileName);
  copyFileSync(source, dest);
  console.info(`published ${dest}`);
});

test.describe.configure({ mode: 'serial' });

test.use({
  video: { mode: 'on', size: { width: 1280, height: 720 } },
  viewport: { width: 1280, height: 720 },
});

test('demo: admit durable task and reconnect to diagnosis artifact', async ({ page }, testInfo) => {
  queuePublish(testInfo, 'demo_admit_and_diagnosis_artifact.webm');
  await signIn(page);
  await page.waitForTimeout(800);
  await startDurableTask(page, 'Investigate CI failure on lint');

  await expect(page.getByTestId('task-page')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('task-objective')).toContainText('Investigate CI failure on lint');
  await expect(page.getByTestId('task-status')).toContainText(/completed|partial/i, {
    timeout: 30_000,
  });
  await expect(page.getByTestId('task-artifact-content')).toContainText(/## Observations/i, {
    timeout: 30_000,
  });
  await expect(page.getByTestId('task-artifact-content')).toContainText(/## Hypotheses/i);
  await expect(page.getByTestId('task-events')).toContainText(
    /task\.admitted|artifact\.persisted/i,
  );
  await page.waitForTimeout(1200);
});

test('demo: cancel a queued durable task run', async ({ page }, testInfo) => {
  test.skip(
    process.env.DEMO_CANCEL !== '1',
    'Set DEMO_CANCEL=1 after restarting demo-api with a slow worker poll',
  );
  queuePublish(testInfo, 'demo_cancel_queued_task.webm');
  await signIn(page);
  await page.waitForTimeout(800);
  await startDurableTask(page, 'Hold for cancel demo — long diagnosis');

  await expect(page.getByTestId('task-page')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('task-cancel')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('task-cancel').click();
  await expect(page.getByTestId('task-status')).toContainText(/cancel/i, { timeout: 15_000 });
  await page.waitForTimeout(1200);
});
