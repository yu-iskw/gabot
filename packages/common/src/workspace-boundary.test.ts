import { describe, expect, it } from 'vitest';

import {
  assertBackendOrigin,
  assertLocalWorkspaceId,
  assertNoFederation,
  assertOneWorkspacePerBackend,
  parseWorkspaceScope,
} from './workspace-boundary.js';

const ENGINEERING = {
  backendId: 'backend-engineering',
  origin: 'https://engineering.example',
  workspaceId: 'ws-1',
};

const PAYMENTS = {
  backendId: 'backend-payments',
  origin: 'https://payments.example',
  workspaceId: 'ws-1',
};

describe('workspace boundary', () => {
  it('parses a scope and rejects a foreign workspace id', () => {
    const scope = parseWorkspaceScope(ENGINEERING);
    expect(scope.ok).toBe(true);
    if (scope.ok) {
      expect(assertLocalWorkspaceId(scope.value, 'ws-1').ok).toBe(true);
      expect(assertLocalWorkspaceId(scope.value, 'ws-other').ok).toBe(false);
    }
  });

  it('rejects a backend id claimed from the wrong origin', () => {
    const result = assertBackendOrigin(
      { backendId: ENGINEERING.backendId, origin: ENGINEERING.origin },
      PAYMENTS.origin,
      ENGINEERING.backendId,
    );
    expect(result.ok).toBe(false);
  });

  it('refuses credential copy and search across backends', () => {
    const from = parseWorkspaceScope(ENGINEERING);
    const to = parseWorkspaceScope(PAYMENTS);
    expect(from.ok && to.ok).toBe(true);
    if (from.ok && to.ok) {
      expect(assertNoFederation('credentials', from.value, to.value).ok).toBe(false);
      expect(assertNoFederation('search', from.value, to.value).ok).toBe(false);
      expect(assertNoFederation('memory', from.value, from.value).ok).toBe(true);
    }
  });

  it('allows only one workspace on a backend origin', () => {
    const occupied = parseWorkspaceScope(ENGINEERING);
    const extra = parseWorkspaceScope({ ...ENGINEERING, workspaceId: 'ws-2' });
    expect(occupied.ok && extra.ok).toBe(true);
    if (occupied.ok && extra.ok) {
      expect(assertOneWorkspacePerBackend(occupied.value, extra.value).ok).toBe(false);
      expect(assertOneWorkspacePerBackend(occupied.value, occupied.value).ok).toBe(true);
    }
  });
});
