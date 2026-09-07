import { describe, expect, it } from 'vitest';

import { activityDetail, activityLabel } from './activity-caption.js';

describe('activity captions', () => {
  it('uses OpenBot verbs for known events', () => {
    expect(activityLabel('mcp.refused')).toBe('Blocked');
    expect(activityLabel('mcp.called')).toBe('Called MCP');
    expect(activityLabel('plugin.granted')).toBe('Granted');
    expect(activityLabel('agent.created')).toBe('Created a bot');
  });

  it('prefers a URL, then a rule, then a reason', () => {
    expect(activityDetail('mcp.called', { url: 'https://example.com' })).toBe(
      'https://example.com',
    );
    expect(activityDetail('mcp.refused', { rule: 'true' })).toBe('true');
    expect(activityDetail('mcp.refused', { reason: 'refused by policy' })).toBe(
      'refused by policy',
    );
  });
});
