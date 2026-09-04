import { describe, expect, it, vi } from 'vitest';

import { createJobsApp, deliverHandoff, deliverRoutine, deliverRun } from './jobs.js';

describe('jobs', () => {
  it('exposes health and tick', async () => {
    const tick = vi.fn().mockResolvedValue({ claimed: 0, routines: 0 });
    const app = createJobsApp(tick);
    const health = await app.request('/health');
    expect(health.status).toBe(200);
    expect(tick).toHaveBeenCalled();
    await app.request('/tick', { method: 'POST' });
    expect(tick).toHaveBeenCalledTimes(2);
  });

  it('posts handoff to the control plane', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await deliverHandoff(
      { key: 'k', payload: { channelId: 'ch-user-1-general', prompt: 'help' } },
      'http://api:3001',
      'secret',
    );
    expect(fetchMock).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('posts a due routine to the control plane', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await deliverRoutine(
      {
        key: 'k',
        payload: {
          channelId: 'ch-user-1-general',
          instruction: 'say hello',
          ownerUserId: 'user-1',
          agentId: 'general-assistant',
        },
      },
      'http://api:3001',
      'secret',
    );
    expect(fetchMock).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('posts a durable run execute to the control plane', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await deliverRun({ key: 'run-1', payload: { runId: 'run-1' } }, 'http://api:3001', 'secret');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/internal/runs/execute');
    vi.unstubAllGlobals();
  });
});
