import { describe, expect, it } from 'vitest';

import {
  assertDelegationBudget,
  attenuateAuthority,
  DEFAULT_MAX_DELEGATION_DEPTH,
  rootAuthority,
  runMayInvoke,
} from './authority.js';
import { COMPUTER_NAVIGATE, DELEGATE_TO_BOT, MCP_ECHO } from './tool-catalog.js';

describe('attenuateAuthority', () => {
  it('intersects requested tools with the parent envelope', () => {
    const parent = rootAuthority([COMPUTER_NAVIGATE, DELEGATE_TO_BOT, MCP_ECHO]);
    const result = attenuateAuthority(parent, [DELEGATE_TO_BOT, MCP_ECHO]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.envelope.allowedTools).toEqual([DELEGATE_TO_BOT, MCP_ECHO]);
    }
  });

  it('copies the parent envelope when requested is empty', () => {
    const parent = rootAuthority([DELEGATE_TO_BOT, MCP_ECHO]);
    const result = attenuateAuthority(parent, []);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.envelope.allowedTools).toEqual(parent.allowedTools);
    }
  });

  it('refuses tools the parent did not pass', () => {
    const parent = rootAuthority([DELEGATE_TO_BOT]);
    const result = attenuateAuthority(parent, [DELEGATE_TO_BOT, COMPUTER_NAVIGATE]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain(COMPUTER_NAVIGATE);
    }
  });
});

describe('runMayInvoke', () => {
  it('allows only listed tools', () => {
    const envelope = rootAuthority([DELEGATE_TO_BOT]);
    expect(runMayInvoke(envelope, DELEGATE_TO_BOT)).toBe(true);
    expect(runMayInvoke(envelope, COMPUTER_NAVIGATE)).toBe(false);
  });
});

describe('assertDelegationBudget', () => {
  it('allows the monitor to triage to coder chain', () => {
    expect(assertDelegationBudget({ depth: 0, childCount: 0, rootRunCount: 1 }).ok).toBe(true);
    expect(assertDelegationBudget({ depth: 1, childCount: 0, rootRunCount: 2 }).ok).toBe(true);
    expect(assertDelegationBudget({ depth: 2, childCount: 0, rootRunCount: 3 }).ok).toBe(true);
  });

  it('refuses a fourth hop', () => {
    const result = assertDelegationBudget({
      depth: DEFAULT_MAX_DELEGATION_DEPTH,
      childCount: 0,
      rootRunCount: 4,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('depth');
    }
  });

  it('refuses too many children or root runs', () => {
    expect(assertDelegationBudget({ depth: 0, childCount: 8, rootRunCount: 1 }).ok).toBe(false);
    expect(assertDelegationBudget({ depth: 0, childCount: 0, rootRunCount: 16 }).ok).toBe(false);
  });
});
