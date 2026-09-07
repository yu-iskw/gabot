export type ChannelPolicy = {
  capability: string;
  channelId: string;
  resource: string;
};

export type ChannelPolicyMatch = { ok: true } | { ok: false; reason: string };

/** Prototype overlay: missing rows inherit. Empty deny lives in policy-algebra.ts. */
export function matchChannelPolicy(input: {
  capability: string;
  channelId: string;
  policies: readonly ChannelPolicy[];
  resource: string;
}): ChannelPolicyMatch {
  const scoped = input.policies.filter(
    (row) => row.channelId === input.channelId && row.capability === input.capability,
  );
  if (scoped.length === 0) {
    return { ok: true };
  }
  if (scoped.some((row) => row.resource === input.resource)) {
    return { ok: true };
  }
  return {
    ok: false,
    reason: `Channel policy does not allow ${input.capability} on ${input.resource}.`,
  };
}
