import type { ChannelPolicyRecord } from './types.js';

export function uniquePolicies(
  channelId: string,
  policies: Array<{ capability: string; resource: string }>,
): ChannelPolicyRecord[] {
  const seen = new Set<string>();
  const rows: ChannelPolicyRecord[] = [];
  for (const policy of policies) {
    const key = `${policy.capability}\0${policy.resource}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    rows.push({ channelId, capability: policy.capability, resource: policy.resource });
  }
  return rows;
}
