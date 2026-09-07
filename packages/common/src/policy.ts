import { evaluate } from 'cel-js';

import {
  DEFAULT_DENY_REASON,
  PERMITTED_REASON,
  POLICY_BLOCK_PREFIX,
  type ActionPolicy,
  type PolicyContext,
  type PolicyDecision,
  type PolicyMode,
} from './policy-types.js';

const POLICY_FUNCTIONS: Record<string, (...args: never[]) => unknown> = {
  contains: (haystack: unknown, needle: unknown) =>
    String(haystack).toLowerCase().includes(String(needle).toLowerCase()),
  matches: (value: unknown, pattern: unknown) => {
    try {
      // CEL `matches` takes an administrator-authored pattern.
      // eslint-disable-next-line security/detect-non-literal-regexp -- policy language
      return new RegExp(String(pattern), 'i').test(String(value));
    } catch {
      throw new Error(`not a valid pattern: ${String(pattern)}`);
    }
  },
};

function matches(expression: string, context: PolicyContext, onError: boolean): boolean {
  try {
    const result = evaluate(expression, context, POLICY_FUNCTIONS);
    if (typeof result === 'boolean') {
      return result;
    }
    return onError;
  } catch {
    return onError;
  }
}

function describeRefusal(context: PolicyContext, expression: string): string {
  if (context.command) {
    return `${POLICY_BLOCK_PREFIX} the command \`${context.command}\` is blocked by the rule \`${expression}\`.`;
  }
  if (context.mcp?.server || context.mcp?.tool) {
    return `${POLICY_BLOCK_PREFIX} ${context.mcp.tool} on ${context.mcp.server} is blocked by the rule \`${expression}\`.`;
  }
  if (context.file?.path) {
    return `${POLICY_BLOCK_PREFIX} the file ${context.file.path} is blocked by the rule \`${expression}\`.`;
  }
  const host = context.page.host;
  return `${POLICY_BLOCK_PREFIX} a ${context.tool.name} action on ${host} is blocked by the rule \`${expression}\`.`;
}

function denied(
  mode: PolicyMode,
  matched: string | null,
  source: PolicyDecision['source'],
  reason: string,
): PolicyDecision {
  return {
    allowed: false,
    mode,
    matched,
    source,
    forward: mode === 'dry-run',
    reason,
  };
}

export function evaluateActionPolicy(
  policy: ActionPolicy | null | undefined,
  context: PolicyContext,
): PolicyDecision {
  const mode: PolicyMode = policy?.mode ?? 'enforce';
  const deny = policy?.deny ?? [];
  const allow = policy?.allow ?? [];

  for (const expression of deny) {
    if (matches(expression, context, true)) {
      return denied(mode, expression, 'deny', describeRefusal(context, expression));
    }
  }

  for (const expression of allow) {
    if (matches(expression, context, false)) {
      return {
        allowed: true,
        mode,
        matched: expression,
        source: 'allow',
        forward: true,
        reason: PERMITTED_REASON,
      };
    }
  }

  return denied(mode, null, 'default', DEFAULT_DENY_REASON);
}

export function pageHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}
