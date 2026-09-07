import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const API = process.env.GABOT_API_URL ?? 'http://127.0.0.1:3001';
const EMAIL = 'admin@example.com';
const PASSWORD = 'gabot-admin-pass';
const MIN_TURNS = Number.parseInt(process.env.GABOT_LIVE_MIN_TURNS ?? '20', 10);
const CHANNEL_ID = process.env.GABOT_LIVE_CHANNEL_ID ?? 'ch-gabot-general';

test.describe('@live-gemini', () => {
  test.skip(
    process.env.GABOT_LIVE_GEMINI !== '1',
    'Set GABOT_LIVE_GEMINI=1 with Compose vertex overlay + ADC',
  );

  test('bot team auto-collaborates for 20+ turns on Vertex Gemini', async ({ page, request }) => {
    test.setTimeout(15 * 60_000);
    await signInAndOpenGeneral(page);
    await page
      .locator('textarea[name="prompt"]')
      .fill(
        `@monitor start long collaboration for ${String(MIN_TURNS + 2)} rounds investigating production anomalies. Keep auto-collaborating via delegate_to_bot across monitor, triage, and coder until the round budget completes.`,
      );
    await page.getByRole('button', { name: 'Send' }).click();

    await expect
      .poll(async () => countCollaborationTurns(request), {
        timeout: 12 * 60_000,
        intervals: [2_000, 5_000, 10_000],
      })
      .toBeGreaterThanOrEqual(MIN_TURNS);

    const token = await emulatorIdToken();
    const events = await request.get(`${API}/api/channels/${CHANNEL_ID}/events`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(events.ok()).toBeTruthy();
    const body = (await events.json()) as { events: Array<{ type: string; actorId?: string }> };
    const bots = new Set(
      body.events
        .filter((row) => row.type === 'agent.delegation.requested' || row.type === 'run.succeeded')
        .map((row) => row.actorId)
        .filter(Boolean),
    );
    expect(bots.size).toBeGreaterThanOrEqual(2);
    await expect(page.getByTestId('messages')).toContainText(/Delegated|collaboration|round/i, {
      timeout: 60_000,
    });
  });
});

async function countCollaborationTurns(request: APIRequestContext): Promise<number> {
  const token = await emulatorIdToken();
  const response = await request.get(`${API}/api/channels/${CHANNEL_ID}/events`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok()) {
    return 0;
  }
  const body = (await response.json()) as { events: Array<{ type: string }> };
  return body.events.filter((row) =>
    [
      'tool.requested',
      'agent.delegation.requested',
      'run.succeeded',
      'agent.delegation.completed',
    ].includes(row.type),
  ).length;
}

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

async function signInAndOpenGeneral(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByTestId('user-email')).toHaveText(EMAIL);
  await expect(page.getByTestId('channel-general')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('channel-general').click();
}
