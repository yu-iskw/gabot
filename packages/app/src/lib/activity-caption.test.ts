import { describe, expect, it } from 'vitest';

import { activityDetail, activityLabel } from './activity-caption.js';

describe('activity captions', () => {
  it('uses OpenBot verbs for known events', () => {
    expect(activityLabel('mcp.refused')).toBe('Blocked');
    expect(activityLabel('mcp.called')).toBe('Called MCP');
    expect(activityLabel('computer.navigate')).toBe('Opened');
    expect(activityLabel('plugin.granted')).toBe('Granted');
    expect(activityLabel('agent.created')).toBe('Created a bot');
  });

  it('prefers a URL, then a rule, then a reason', () => {
    expect(activityDetail('computer.navigate', { url: 'https://example.com' })).toBe(
      'https://example.com',
    );
    expect(activityDetail('computer.refused', { rule: 'contains(page.host, "x")' })).toBe(
      'contains(page.host, "x")',
    );
  });
});
