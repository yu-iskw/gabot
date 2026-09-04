import { describe, expect, it } from 'vitest';

import { createComputerApp } from './app.js';

describe('computer HTTP', () => {
  it('requires a token and navigates when authorised', async () => {
    expect(() =>
      createComputerApp('', {
        navigate: (url) => Promise.resolve({ url, title: '', text: '' }),
        screenshot: () => Promise.resolve({ base64: '', width: 0 }),
      }),
    ).toThrow('COMPUTER_TOKEN');
    const app = createComputerApp('secret', {
      navigate: (url) => Promise.resolve({ url, title: 'Example Domain', text: 'Example Domain' }),
      screenshot: () => Promise.resolve({ base64: 'abc', width: 800 }),
    });
    const denied = await app.request('/navigate', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.com' }),
    });
    expect(denied.status).toBe(401);
    const ok = await app.request('/navigate', {
      method: 'POST',
      headers: { authorization: 'Bearer secret', 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com' }),
    });
    expect(ok.status).toBe(200);
    const health = await app.request('/health');
    expect(health.status).toBe(200);
    const missing = await app.request('/navigate', {
      method: 'POST',
      headers: { authorization: 'Bearer secret', 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(missing.status).toBe(400);
    const shot = await app.request('/screenshot', {
      method: 'POST',
      headers: { authorization: 'Bearer secret' },
    });
    expect(shot.status).toBe(200);
  });
});
