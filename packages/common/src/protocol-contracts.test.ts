import { describe, expect, it } from 'vitest';

import { CATALOG_STAGES, invocationAuthorized } from './catalog-stage.js';
import {
  apiVersionsCompatible,
  assertEventInScope,
  bindBootstrapDiscovery,
  contractError,
  parseBootstrapDiscovery,
  parseScopedFeedEvent,
} from './protocol-contracts.js';
import { parseRunIdentity } from './run-identity.js';
import { parseWorkspaceScope } from './workspace-boundary.js';

const ISSUER = 'https://idp.example/realms/gabot';
const ENGINEERING_ORIGIN = 'https://engineering.example';
const PAYMENTS_ORIGIN = 'https://payments.example';

const HUMAN_IDENTITY = {
  issuer: ISSUER,
  subject: 'sub-1',
  tenant: 'acme',
};

describe('catalog stages', () => {
  it('keeps catalog stages in admission order', () => {
    expect(CATALOG_STAGES).toEqual(['publish', 'admit', 'install', 'connect', 'grant', 'invoke']);
  });

  it('does not authorize invoke from install alone', () => {
    expect(
      invocationAuthorized({
        admitted: true,
        connected: false,
        granted: false,
        installed: true,
      }),
    ).toBe(false);
    expect(
      invocationAuthorized({
        admitted: true,
        connected: true,
        granted: true,
        installed: true,
      }),
    ).toBe(true);
  });
});

describe('run identity', () => {
  it('parses principal sponsor and audience', () => {
    const result = parseRunIdentity({
      accountableSponsor: { id: 'team-payments', kind: 'team' },
      backendId: 'backend-engineering',
      executionPrincipal: { identity: HUMAN_IDENTITY, kind: 'user' },
      initiatedBy: { identity: HUMAN_IDENTITY, kind: 'human' },
      outputAudience: { ids: ['ch-general'], kind: 'channel' },
      workspaceId: 'ws-1',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.executionPrincipal.kind).toBe('user');
      expect(result.value.accountableSponsor.kind).toBe('team');
      expect(result.value.outputAudience.ids).toEqual(['ch-general']);
    }
  });
});

describe('bootstrap discovery', () => {
  it('is not trust and must match an approved origin binding', () => {
    const discovery = {
      apiVersion: 'v1',
      auth: { type: 'oidc' },
      backendId: 'backend-engineering',
      workspaceId: 'ws-1',
    };
    const trusted = bindBootstrapDiscovery({
      approved: { backendId: 'backend-engineering', origin: ENGINEERING_ORIGIN },
      discovery,
      presentedOrigin: ENGINEERING_ORIGIN,
    });
    expect(trusted.ok).toBe(true);
    const stolenId = bindBootstrapDiscovery({
      approved: { backendId: 'backend-payments', origin: PAYMENTS_ORIGIN },
      discovery,
      presentedOrigin: PAYMENTS_ORIGIN,
    });
    expect(stolenId.ok).toBe(false);
    expect(apiVersionsCompatible('v1.4.0', '1.0.0')).toBe(true);
    expect(apiVersionsCompatible('v2', 'v1')).toBe(false);
  });

  it('rejects blank issuer or audience when those fields are present', () => {
    const base = {
      apiVersion: 'v1',
      backendId: 'backend-engineering',
      workspaceId: 'ws-1',
    };
    expect(
      parseBootstrapDiscovery({
        ...base,
        auth: { issuer: '', type: 'oidc' },
      }).ok,
    ).toBe(false);
    expect(
      parseBootstrapDiscovery({
        ...base,
        auth: { audience: '   ', type: 'oidc' },
      }).ok,
    ).toBe(false);
    expect(
      parseBootstrapDiscovery({
        ...base,
        auth: { type: 'oidc' },
      }).ok,
    ).toBe(true);
  });
});

describe('scoped events', () => {
  it('refuses to apply a delayed event from another origin', () => {
    const event = parseScopedFeedEvent({
      cursor: 'c1',
      occurredAt: '2026-09-06T08:00:00.000Z',
      ref: {
        backendId: 'backend-engineering',
        localId: 'evt-1',
        origin: ENGINEERING_ORIGIN,
        resourceType: 'event',
        workspaceId: 'ws-1',
      },
    });
    const payments = parseWorkspaceScope({
      backendId: 'backend-payments',
      origin: PAYMENTS_ORIGIN,
      workspaceId: 'ws-1',
    });
    expect(event.ok && payments.ok).toBe(true);
    if (event.ok && payments.ok) {
      expect(assertEventInScope(event.value, payments.value).ok).toBe(false);
    }
  });

  it('rejects occurredAt values that are not ISO-8601 instants', () => {
    const ref = {
      backendId: 'backend-engineering',
      localId: 'evt-1',
      origin: ENGINEERING_ORIGIN,
      resourceType: 'event',
      workspaceId: 'ws-1',
    };
    expect(parseScopedFeedEvent({ cursor: 'c1', occurredAt: '09/06/2026', ref }).ok).toBe(false);
    expect(parseScopedFeedEvent({ cursor: 'c1', occurredAt: 'Sep 6 2026', ref }).ok).toBe(false);
    expect(parseScopedFeedEvent({ cursor: 'c1', occurredAt: '2026', ref }).ok).toBe(false);
    expect(parseScopedFeedEvent({ cursor: 'c1', occurredAt: '2026-02-31T00:00:00Z', ref }).ok).toBe(
      false,
    );
  });
});

describe('contract errors', () => {
  it('carries a code and public message only', () => {
    const error = contractError('unauthorized', 'Not a member of this workspace.');
    expect(error).toEqual({
      code: 'unauthorized',
      message: 'Not a member of this workspace.',
    });
  });
});
