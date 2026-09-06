import { describe, expect, it } from 'vitest';

import { workspaceDefaultChannelId } from './workspace-channel.js';

describe('workspaceDefaultChannelId', () => {
  it('matches the API default General channel id', () => {
    expect(workspaceDefaultChannelId('ws-gabot')).toBe('ch-gabot-general');
  });
});
