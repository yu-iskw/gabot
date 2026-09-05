import { expect, test, type Page } from '@playwright/test';

const API = process.env.GABOT_API_URL ?? 'http://127.0.0.1:3001';
const AGENT = process.env.GABOT_AGENT_URL ?? 'http://127.0.0.1:4200';
const EMAIL = 'admin@example.com';
const PASSWORD = 'gabot-admin-pass';

async function emulatorIdToken(): Promise<string> {
  const response = await fetch(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-gabot',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
    },
  );
  const body = (await response.json()) as { idToken?: string };
  if (!body.idToken) {
    throw new Error('Failed to mint emulator id token');
  }
  return body.idToken;
}

async function signIn(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByTestId('user-email')).toHaveText(EMAIL);
}

async function openGeneral(page: Page): Promise<void> {
  await expect(page.getByTestId('channel-general')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('channel-general').click();
}

async function signInAndOpenGeneral(page: Page, watch = false): Promise<void> {
  await signIn(page);
  await openGeneral(page);
  if (watch) {
    await page.getByRole('button', { name: "Watch this Bot's screen" }).click();
  }
}

test('signs in, navigates example.com, and records computer audit', async ({ page }) => {
  await signInAndOpenGeneral(page, true);
  await page.locator('textarea[name="prompt"]').fill('please navigate to example.com');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByTestId('assistant-reply')).toContainText(/example.com/i, {
    timeout: 60_000,
  });
  await expect(page.getByTestId('audit-events')).toContainText('Opened');
});

test('refuses example.com when a deny rule is in force', async ({ page, request }) => {
  const token = await emulatorIdToken();
  const original = await request.get(`${API}/api/computers/policy`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const originalBody = (await original.json()) as { policy: unknown };
  const rule = 'contains(page.host, "example.com")';
  await request.put(`${API}/api/computers/policy`, {
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    data: { mode: 'enforce', deny: [rule], allow: ['true'] },
  });
  try {
    await signInAndOpenGeneral(page, true);
    await page.locator('textarea[name="prompt"]').fill('please navigate to example.com');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByTestId('assistant-reply')).toContainText(/policy|refus/i, {
      timeout: 60_000,
    });
    await expect(page.getByTestId('audit-events')).toContainText('Blocked');
    await expect(page.getByTestId('audit-events')).toContainText(/contains\(page\.host/);
  } finally {
    await request.put(`${API}/api/computers/policy`, {
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      data: originalBody.policy,
    });
  }
});

test('serves a valid A2A agent card', async ({ request }) => {
  const response = await request.get(`${AGENT}/.well-known/agent-card.json`);
  expect(response.ok()).toBeTruthy();
  const card = (await response.json()) as { name?: string; skills?: unknown[] };
  expect(card.name).toBeTruthy();
  expect(Array.isArray(card.skills)).toBeTruthy();
});

test('refuses MCP echo without a grant', async ({ page }) => {
  await signInAndOpenGeneral(page, true);
  await page.locator('textarea[name="prompt"]').fill('please echo hello via mcp');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByTestId('assistant-reply')).toContainText(/grant|refus/i, {
    timeout: 60_000,
  });
  await expect(page.getByTestId('audit-events')).toContainText('Blocked');
  await expect(page.getByTestId('audit-events')).toContainText(/grant/i);
});

test('a bot can create a bot and it appears on Agents', async ({ page }) => {
  await signInAndOpenGeneral(page);
  await page.locator('textarea[name="prompt"]').fill('please create a bot named Research');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByTestId('assistant-reply')).toContainText(/Research/i, {
    timeout: 60_000,
  });
  await page.getByRole('link', { name: 'Agents' }).click();
  await expect(page.locator('main').getByText('Research').first()).toBeVisible();
});

test('a bot can schedule a task and it appears on Routines', async ({ page }) => {
  await signInAndOpenGeneral(page);
  await page.locator('textarea[name="prompt"]').fill('schedule a task every minute to say hello');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByTestId('assistant-reply')).toContainText(/Scheduled/i, {
    timeout: 60_000,
  });
  await page.getByRole('link', { name: 'Routines' }).click();
  await expect(page.getByText('say hello').first()).toBeVisible();
});

test('edits an agent title and deletes a created agent', async ({ page }) => {
  await signInAndOpenGeneral(page);
  await page.locator('textarea[name="prompt"]').fill('please create a bot named Lifecycle');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByTestId('assistant-reply')).toContainText(/Lifecycle/i, {
    timeout: 60_000,
  });
  await page.getByRole('link', { name: 'Agents' }).click();
  await page
    .locator('main')
    .getByRole('button', { name: /Lifecycle/i })
    .first()
    .click();
  await expect(page.getByTestId('agent-profile')).toBeVisible();
  await page.getByTestId('edit-agent').scrollIntoViewIfNeeded();
  await page.getByTestId('edit-agent').click({ force: true });
  await page.locator('input[name="agent-title"]').fill('Lifecycle Edited');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('main').getByText('Lifecycle Edited').first()).toBeVisible();
  await page.getByTestId('delete-agent').scrollIntoViewIfNeeded();
  await page.getByTestId('delete-agent').click({ force: true });
  await expect(page.locator('main').getByText('Lifecycle Edited')).toHaveCount(0);
});

test('creates and edits a skill from Skills', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByTestId('user-email')).toHaveText(EMAIL);
  await page.getByRole('link', { name: 'Skills' }).click();
  await page.getByTestId('new-skill').click();
  await page.locator('input[name="skill-slug"]').fill('lifecycle-brief');
  await page.locator('input[name="skill-title"]').fill('Lifecycle brief');
  await page.locator('input[name="skill-summary"]').fill('A short brief skill');
  await page.locator('textarea[name="skill-instructions"]').fill('Write two bullets.');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('/lifecycle-brief')).toBeVisible();
  await page.getByTestId('skill-row-lifecycle-brief').click();
  await page.locator('textarea[name="skill-instructions"]').fill('Write three bullets.');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByTestId('skill-row-lifecycle-brief').click();
  await expect(page.locator('textarea[name="skill-instructions"]')).toHaveValue(
    'Write three bullets.',
  );
});

test('updates a routine instruction through chat', async ({ page }) => {
  await signInAndOpenGeneral(page);
  await page.locator('textarea[name="prompt"]').fill('schedule a task every minute to say hello');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByTestId('assistant-reply')).toContainText(/Scheduled/i, {
    timeout: 60_000,
  });
  await page.locator('textarea[name="prompt"]').fill('change the say hello routine to say hi');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByTestId('assistant-reply')).toContainText(/Updated/i, {
    timeout: 60_000,
  });
  await page.getByRole('link', { name: 'Routines' }).click();
  await expect(page.getByText('say hi').first()).toBeVisible();
});

test('grants MCP echo from Plugins so a bot can call it', async ({ page, request }) => {
  const token = await emulatorIdToken();
  try {
    await signIn(page);
    await page.goto('/admin/plugins/mock/tools/echo');
    await expect(page.locator('main h1')).toHaveText('echo');
    await page.getByRole('switch', { name: 'Grant echo for this workspace' }).click();
    await expect(
      page.getByRole('switch', { name: 'Grant echo for this workspace' }),
    ).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('channel-general').click();
    await page.getByRole('button', { name: "Watch this Bot's screen" }).click();
    await page.locator('textarea[name="prompt"]').fill('please echo hello via mcp');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByTestId('assistant-reply')).toContainText(/MCP echo|hello/i, {
      timeout: 60_000,
    });
    await expect(page.getByTestId('audit-events')).toContainText('Called MCP');
  } finally {
    await request.put(`${API}/api/admin/plugins/mock/grants`, {
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      data: { ref: 'mock/echo', granted: false },
    });
  }
});

test('delegates monitor to triage to coder without human relay', async ({ page }) => {
  await signInAndOpenGeneral(page);
  await page
    .locator('textarea[name="prompt"]')
    .fill('@monitor inspect production errors from the last 24 hours');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByTestId('assistant-reply')).toContainText(/Delegated|triage/i, {
    timeout: 60_000,
  });
  await expect(async () => {
    await page.reload();
    await expect(page.getByText(/coding-agent|Started coding/i).first()).toBeVisible();
  }).toPass({ timeout: 60_000 });
});
