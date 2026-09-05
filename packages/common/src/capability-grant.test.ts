import { describe, expect, it } from 'vitest';

import {
  CAPABILITY_GITHUB_ISSUES_CREATE,
  defaultOwnerConnections,
  defaultOwnerGrants,
  GITHUB_ALLOWED_REPO,
  matchCapabilityGrant,
  PROVIDER_GITHUB,
} from './capability-grant.js';

const workspaceId = 'ws-user-1';
const ownerUserId = 'user-1';

describe('matchCapabilityGrant', () => {
  const connections = defaultOwnerConnections(workspaceId, ownerUserId);
  const grants = defaultOwnerGrants(workspaceId, ownerUserId);

  it('allows the exact granted GitHub repository', () => {
    const result = matchCapabilityGrant({
      workspaceId,
      ownerUserId,
      capability: CAPABILITY_GITHUB_ISSUES_CREATE,
      resource: GITHUB_ALLOWED_REPO,
      connections,
      grants,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.connection.provider).toBe(PROVIDER_GITHUB);
      expect(result.connection.credentialRef).toBe('github-stub');
      expect(result.grant.resource).toBe(GITHUB_ALLOWED_REPO);
    }
  });

  it('denies a different repository', () => {
    const result = matchCapabilityGrant({
      workspaceId,
      ownerUserId,
      capability: CAPABILITY_GITHUB_ISSUES_CREATE,
      resource: 'acme/other',
      connections,
      grants,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('acme/other');
    }
  });

  it('denies when the owner does not match', () => {
    const result = matchCapabilityGrant({
      workspaceId,
      ownerUserId: 'other',
      capability: CAPABILITY_GITHUB_ISSUES_CREATE,
      resource: GITHUB_ALLOWED_REPO,
      connections,
      grants,
    });
    expect(result.ok).toBe(false);
  });

  it('denies a revoked connection', () => {
    const revoked = connections.map((connection) =>
      connection.provider === PROVIDER_GITHUB
        ? { ...connection, status: 'revoked' as const }
        : connection,
    );
    const result = matchCapabilityGrant({
      workspaceId,
      ownerUserId,
      capability: CAPABILITY_GITHUB_ISSUES_CREATE,
      resource: GITHUB_ALLOWED_REPO,
      connections: revoked,
      grants,
    });
    expect(result.ok).toBe(false);
  });
});
