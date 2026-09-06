import { describe, expect, it } from 'vitest';

import { CAPABILITY_GITHUB_ISSUES_CREATE, GITHUB_ALLOWED_REPO } from './capability-grant.js';
import {
  allowSet,
  combinePolicyLayers,
  emptyAllowSet,
  optionalAllowFromChannelRows,
  resourcePermitted,
  unrestrictedAllowSet,
} from './policy-algebra.js';
import { personalChannelId } from './tenancy.js';

const CHANNEL_ID = personalChannelId('user-1');

describe('policy algebra', () => {
  it('inherits when an optional restriction is missing', () => {
    const combined = combinePolicyLayers([
      {
        allow: allowSet([GITHUB_ALLOWED_REPO, 'acme/other']),
        kind: 'mandatory',
        name: 'workspace',
      },
      {
        allow: unrestrictedAllowSet(),
        kind: 'optional',
        name: 'channel',
      },
    ]);
    expect(resourcePermitted(combined, GITHUB_ALLOWED_REPO).ok).toBe(true);
    expect(resourcePermitted(combined, 'acme/other').ok).toBe(true);
  });

  it('denies every resource when the allowed set is empty', () => {
    const combined = combinePolicyLayers([
      {
        allow: allowSet([GITHUB_ALLOWED_REPO]),
        kind: 'mandatory',
        name: 'workspace',
      },
      {
        allow: emptyAllowSet(),
        kind: 'optional',
        name: 'channel',
      },
    ]);
    expect(resourcePermitted(combined, GITHUB_ALLOWED_REPO).ok).toBe(false);
  });

  it('intersects independent restrictive layers and unions one allow set', () => {
    const combined = combinePolicyLayers([
      {
        allow: allowSet(['repo-a', 'repo-b']),
        kind: 'mandatory',
        name: 'company',
      },
      {
        allow: allowSet(['repo-b', 'repo-c']),
        kind: 'optional',
        name: 'channel',
      },
    ]);
    expect(resourcePermitted(combined, 'repo-b').ok).toBe(true);
    expect(resourcePermitted(combined, 'repo-a').ok).toBe(false);
    expect(resourcePermitted(combined, 'repo-c').ok).toBe(false);
  });

  it('lets explicit deny win over an allow list', () => {
    const combined = combinePolicyLayers([
      {
        allow: allowSet(['repo-a', 'repo-b']),
        deny: ['repo-a'],
        kind: 'mandatory',
        name: 'workspace',
      },
    ]);
    expect(resourcePermitted(combined, 'repo-a').ok).toBe(false);
    expect(resourcePermitted(combined, 'repo-b').ok).toBe(true);
  });

  it('maps missing channel policy rows to inherit, not empty deny', () => {
    const inherit = optionalAllowFromChannelRows(
      [
        {
          capability: 'mcp:mock/echo',
          channelId: CHANNEL_ID,
          resource: 'mock/echo',
        },
      ],
      CHANNEL_ID,
      CAPABILITY_GITHUB_ISSUES_CREATE,
    );
    expect(inherit).toEqual(unrestrictedAllowSet());
    const listed = optionalAllowFromChannelRows(
      [
        {
          capability: CAPABILITY_GITHUB_ISSUES_CREATE,
          channelId: CHANNEL_ID,
          resource: GITHUB_ALLOWED_REPO,
        },
      ],
      CHANNEL_ID,
      CAPABILITY_GITHUB_ISSUES_CREATE,
    );
    expect(listed).toEqual(allowSet([GITHUB_ALLOWED_REPO]));
  });
});
