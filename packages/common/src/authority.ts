export const DEFAULT_MAX_DELEGATION_DEPTH = 3;
export const DEFAULT_MAX_CHILD_RUNS = 8;
export const DEFAULT_MAX_RUNS_PER_ROOT = 16;
export const DEFAULT_MODEL_STEPS_PER_RUN = 4;

export type AuthorityEnvelope = {
  allowedTools: string[];
};

export type AuthorityResult =
  { envelope: AuthorityEnvelope; ok: true } | { ok: false; reason: string };

export type BudgetResult = { ok: true } | { ok: false; reason: string };

export type DelegationBudget = {
  childCount: number;
  depth: number;
  maxChildRuns?: number;
  maxDepth?: number;
  maxRunsPerRoot?: number;
  rootRunCount: number;
};

export function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}

export function configuredMaxDelegationDepth(): number {
  return readPositiveIntEnv('GABOT_MAX_DELEGATION_DEPTH', DEFAULT_MAX_DELEGATION_DEPTH);
}

export function configuredMaxChildRuns(): number {
  return readPositiveIntEnv('GABOT_MAX_CHILD_RUNS', DEFAULT_MAX_CHILD_RUNS);
}

export function configuredMaxRunsPerRoot(): number {
  return readPositiveIntEnv('GABOT_MAX_RUNS_PER_ROOT', DEFAULT_MAX_RUNS_PER_ROOT);
}

export function configuredModelStepsPerRun(): number {
  return readPositiveIntEnv('GABOT_MODEL_STEPS_PER_RUN', DEFAULT_MODEL_STEPS_PER_RUN);
}

export function rootAuthority(allowedTools: readonly string[]): AuthorityEnvelope {
  return { allowedTools: uniqueTools(allowedTools) };
}

export function cloneAuthority(envelope: AuthorityEnvelope): AuthorityEnvelope {
  return { allowedTools: uniqueTools(envelope.allowedTools) };
}

export function attenuateAuthority(
  parent: AuthorityEnvelope,
  requested: readonly string[],
): AuthorityResult {
  const parentSet = new Set(parent.allowedTools);
  const wanted = requested.length > 0 ? requested : parent.allowedTools;
  const extra = wanted.filter((tool) => !parentSet.has(tool));
  if (extra.length > 0) {
    return {
      ok: false,
      reason: `Child authority cannot exceed parent: ${extra.join(', ')}`,
    };
  }
  return {
    ok: true,
    envelope: { allowedTools: uniqueTools(wanted.filter((tool) => parentSet.has(tool))) },
  };
}

export function runMayInvoke(envelope: AuthorityEnvelope, toolName: string): boolean {
  return envelope.allowedTools.includes(toolName);
}

export function assertDelegationBudget(input: DelegationBudget): BudgetResult {
  const maxDepth = input.maxDepth ?? configuredMaxDelegationDepth();
  const maxChildRuns = input.maxChildRuns ?? configuredMaxChildRuns();
  const maxRunsPerRoot = input.maxRunsPerRoot ?? configuredMaxRunsPerRoot();
  if (input.depth >= maxDepth) {
    return {
      ok: false,
      reason: `Delegation depth ${String(input.depth + 1)} exceeds max ${String(maxDepth)}`,
    };
  }
  if (input.childCount >= maxChildRuns) {
    return {
      ok: false,
      reason: `Run already has ${String(input.childCount)} children; max is ${String(maxChildRuns)}`,
    };
  }
  if (input.rootRunCount >= maxRunsPerRoot) {
    return {
      ok: false,
      reason: `Root already has ${String(input.rootRunCount)} runs; max is ${String(maxRunsPerRoot)}`,
    };
  }
  return { ok: true };
}

function uniqueTools(tools: readonly string[]): string[] {
  return [...new Set(tools.filter((tool) => tool.length > 0))];
}
