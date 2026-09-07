import { describe, expect, it } from 'vitest';

import { DEFAULT_ALLOW_POLICY, DEFAULT_DENY_REASON, PERMITTED_REASON } from './policy-types.js';
import { evaluateActionPolicy, pageHost } from './policy.js';

import type { PolicyContext } from './policy-types.js';

function context(overrides: Partial<PolicyContext> = {}): PolicyContext {
  return {
    tool: { name: 'mcp__mock__echo' },
    bot: { id: 'general-assistant' },
    page: { url: 'https://example.com/', host: 'example.com' },
    actor: { id: 'user-1' },
    intent: 'navigate',
    ...overrides,
  };
}

describe('evaluateActionPolicy', () => {
  it('denies when policy is missing', () => {
    const decision = evaluateActionPolicy(null, context());
    expect(decision.allowed).toBe(false);
    expect(decision.forward).toBe(false);
    expect(decision.source).toBe('default');
    expect(decision.reason).toBe(DEFAULT_DENY_REASON);
  });

  it('permits when allow is true', () => {
    const decision = evaluateActionPolicy(DEFAULT_ALLOW_POLICY, context());
    expect(decision.allowed).toBe(true);
    expect(decision.forward).toBe(true);
    expect(decision.reason).toBe(PERMITTED_REASON);
    expect(decision.matched).toBe('true');
  });

  it('evaluates deny before allow', () => {
    const decision = evaluateActionPolicy(
      {
        mode: 'enforce',
        deny: ['contains(page.host, "example.com")'],
        allow: ['true'],
      },
      context(),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.source).toBe('deny');
    expect(decision.matched).toContain('example.com');
    expect(decision.reason).toContain('policy');
  });

  it('forwards a deny in dry-run', () => {
    const decision = evaluateActionPolicy(
      {
        mode: 'dry-run',
        deny: ['true'],
        allow: [],
      },
      context(),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.forward).toBe(true);
  });

  it('treats a broken deny expression as a denial', () => {
    const decision = evaluateActionPolicy(
      {
        mode: 'enforce',
        deny: ['not a valid cel {'],
        allow: ['true'],
      },
      context(),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.source).toBe('deny');
  });

  it('does not permit on a broken allow expression', () => {
    const decision = evaluateActionPolicy(
      {
        mode: 'enforce',
        deny: [],
        allow: ['"Submit order"'],
      },
      context(),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.source).toBe('default');
  });

  it('matches MCP context in the refusal sentence', () => {
    const decision = evaluateActionPolicy(
      {
        mode: 'enforce',
        deny: ['mcp.server == "mock"'],
        allow: ['true'],
      },
      context({
        tool: { name: 'mcp__mock__echo' },
        mcp: { server: 'mock', tool: 'echo', effect: 'write' },
        intent: 'write_tool',
      }),
    );
    expect(decision.reason).toContain('echo');
    expect(decision.reason).toContain('mock');
  });

  it('matches command and file refusals', () => {
    const command = evaluateActionPolicy(
      { mode: 'enforce', deny: ['intent == "run_command"'], allow: ['true'] },
      context({ intent: 'run_command', command: 'rm -rf /' }),
    );
    expect(command.reason).toContain('rm -rf /');

    const file = evaluateActionPolicy(
      { mode: 'enforce', deny: ['file.extension == "env"'], allow: ['true'] },
      context({
        tool: { name: 'mcp__mock__search' },
        intent: 'read_file',
        file: { path: '.env', name: '.env', extension: 'env' },
      }),
    );
    expect(file.reason).toContain('.env');
  });

  it('supports contains() case-insensitively', () => {
    const decision = evaluateActionPolicy(
      { mode: 'enforce', deny: ['contains(page.host, "EXAMPLE")'], allow: ['true'] },
      context(),
    );
    expect(decision.source).toBe('deny');
  });

  it('supports matches() against a host pattern', () => {
    const decision = evaluateActionPolicy(
      { mode: 'enforce', deny: ['matches(page.host, "^example")'], allow: ['true'] },
      context(),
    );
    expect(decision.source).toBe('deny');
  });
});

describe('pageHost', () => {
  it('parses a URL host', () => {
    expect(pageHost('https://example.com/path')).toBe('example.com');
  });

  it('returns empty for garbage', () => {
    expect(pageHost('not a url')).toBe('');
  });
});
