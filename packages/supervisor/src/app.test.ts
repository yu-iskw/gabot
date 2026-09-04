import { describe, expect, it } from 'vitest';

import { createSupervisorApp } from './app.js';

describe('supervisor', () => {
  it('ensures, lists, stops and resets a computer', async () => {
    const app = createSupervisorApp('secret', 'http://computer:4100');
    const headers = { authorization: 'Bearer secret' };
    await app.request('/computers/general-assistant/ensure', { method: 'POST', headers });
    const listed = (await (await app.request('/computers', { headers })).json()) as {
      computers: Array<{ botId: string }>;
    };
    expect(listed.computers).toHaveLength(1);
    const stopped = await app.request('/computers/general-assistant/stop', {
      method: 'POST',
      headers,
    });
    expect(await stopped.json()).toMatchObject({ status: 'stopped' });
    const reset = await app.request('/computers/general-assistant/reset', {
      method: 'POST',
      headers,
    });
    expect(await reset.json()).toMatchObject({ status: 'running' });
    expect((await app.request('/health')).status).toBe(200);
    expect((await app.request('/computers')).status).toBe(401);
    expect(() => createSupervisorApp('', 'http://computer:4100')).toThrow('SUPERVISOR_TOKEN');
  });
});
