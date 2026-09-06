import { contractFail, contractOk } from './contract-result.js';

import type { ChannelPolicy } from './channel-policy.js';
import type { ContractResult } from './contract-result.js';

export type AllowSet = { kind: 'allow'; values: readonly string[] } | { kind: 'unrestricted' };

export type PolicyLayerKind = 'mandatory' | 'optional';

export type PolicyLayer = {
  allow: AllowSet;
  deny?: readonly string[];
  kind: PolicyLayerKind;
  name: string;
};

export type CombinedAllow = { kind: 'allow'; values: readonly string[] } | { kind: 'unrestricted' };

export type CombinedPolicy = {
  allow: CombinedAllow;
  deny: readonly string[];
};

export function emptyAllowSet(): AllowSet {
  return { kind: 'allow', values: [] };
}

export function unrestrictedAllowSet(): AllowSet {
  return { kind: 'unrestricted' };
}

export function allowSet(values: readonly string[]): AllowSet {
  return { kind: 'allow', values: uniqueSorted(values) };
}

export function optionalAllowFromChannelRows(
  rows: readonly ChannelPolicy[],
  channelId: string,
  capability: string,
): AllowSet {
  const scoped = rows.filter((row) => row.channelId === channelId && row.capability === capability);
  if (scoped.length === 0) {
    return unrestrictedAllowSet();
  }
  return allowSet(scoped.map((row) => row.resource));
}

export function combinePolicyLayers(layers: readonly PolicyLayer[]): CombinedPolicy {
  let allow: CombinedAllow = unrestrictedAllowSet();
  const deny = new Set<string>();
  for (const layer of layers) {
    addDenyValues(deny, layer.deny);
    const next = allowSetForLayer(layer);
    if (next !== undefined) {
      allow = intersectCombinedAllow(allow, next);
    }
  }
  return { allow, deny: uniqueSorted([...deny]) };
}

export function resourcePermitted(
  combined: CombinedPolicy,
  resource: string,
): ContractResult<void> {
  const name = resource.trim();
  if (name.length === 0) {
    return contractFail('Resource is required.');
  }
  if (combined.deny.includes(name)) {
    return contractFail(`Resource ${name} is explicitly denied.`);
  }
  if (combined.allow.kind === 'unrestricted') {
    return contractOk(undefined);
  }
  if (combined.allow.values.includes(name)) {
    return contractOk(undefined);
  }
  if (combined.allow.values.length === 0) {
    return contractFail('Empty allowed set denies all resources.');
  }
  return contractFail(`Resource ${name} is not in the allowed set.`);
}

function allowSetForLayer(layer: PolicyLayer): AllowSet | undefined {
  if (layer.kind === 'optional' && layer.allow.kind === 'unrestricted') {
    return undefined;
  }
  return layer.allow;
}

function addDenyValues(deny: Set<string>, values: readonly string[] | undefined): void {
  if (values === undefined) {
    return;
  }
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      deny.add(trimmed);
    }
  }
}

function intersectCombinedAllow(current: CombinedAllow, next: AllowSet): CombinedAllow {
  if (next.kind === 'unrestricted') {
    return current;
  }
  const nextValues = uniqueSorted(next.values);
  if (current.kind === 'unrestricted') {
    return { kind: 'allow', values: nextValues };
  }
  const nextSet = new Set(nextValues);
  return {
    kind: 'allow',
    values: current.values.filter((value) => nextSet.has(value)),
  };
}

function uniqueSorted(values: readonly string[]): string[] {
  const unique = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      unique.add(trimmed);
    }
  }
  return [...unique].sort((left, right) => left.localeCompare(right));
}
