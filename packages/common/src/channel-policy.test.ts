import { describe, expect, it } from 'vitest';

import { CAPABILITY_GITHUB_ISSUES_CREATE, GITHUB_ALLOWED_REPO } from './capability-grant.js';
import { matchChannelPolicy } from './channel-policy.js';

const channelId = 'ch-user-1-general';

describe('matchChannelPolicy', () => {
  it('inherits the workspace grant when the channel has no rows for the capability', () => {
    const result = matchChannelPolicy({
      channelId,
      capability: CAPABILITY_GITHUB_ISSUES_CREATE,
      resource: 'acme/denied',
      policies: [
        {
          channelId,
          capability: 'mcp:mock/echo',
          resource: 'mock/echo',
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it('allows an exact resource when the channel lists that capability', () => {
    const result = matchChannelPolicy({
      channelId,
      capability: CAPABILITY_GITHUB_ISSUES_CREATE,
      resource: GITHUB_ALLOWED_REPO,
      policies: [
        {
          channelId,
          capability: CAPABILITY_GITHUB_ISSUES_CREATE,
          resource: GITHUB_ALLOWED_REPO,
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it('denies a resource that is not on the channel allow-list', () => {
    const result = matchChannelPolicy({
      channelId,
      capability: CAPABILITY_GITHUB_ISSUES_CREATE,
      resource: 'acme/denied',
      policies: [
        {
          channelId,
          capability: CAPABILITY_GITHUB_ISSUES_CREATE,
          resource: GITHUB_ALLOWED_REPO,
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('acme/denied');
    }
  });

  it('ignores policies on a different channel', () => {
    const result = matchChannelPolicy({
      channelId,
      capability: CAPABILITY_GITHUB_ISSUES_CREATE,
      resource: 'acme/denied',
      policies: [
        {
          channelId: 'other',
          capability: CAPABILITY_GITHUB_ISSUES_CREATE,
          resource: GITHUB_ALLOWED_REPO,
        },
      ],
    });
    expect(result.ok).toBe(true);
  });
});
