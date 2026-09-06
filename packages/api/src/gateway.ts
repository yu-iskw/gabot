import {
  ASK_PERSON,
  asString,
  asStringArray,
  attenuateAuthority,
  CAPABILITY_COMPONENT_NOTE,
  CAPABILITY_GITHUB_ISSUES_CREATE,
  CAPABILITY_MCP_ECHO,
  COMPONENT_NOTE,
  CREATE_BOT,
  CREATE_ROUTINE,
  DELEGATE_TO_BOT,
  evaluateActionPolicy,
  GITHUB_CREATE_ISSUE,
  matchCapabilityGrant,
  matchChannelPolicy,
  MCP_ECHO,
  nextRoutineRun,
  pageHost,
  RESOURCE_COMPONENT_NOTE,
  RESOURCE_MCP_ECHO,
  runMayInvoke,
  UPDATE_ROUTINE,
} from '@gabot/common';

import { DelegationBudgetError } from './store/types.js';

import type { GabotStore, RoutinePatch, RunRecord } from './store/types.js';
import type { PolicyContext } from '@gabot/common';

type GatewayResult = {
  ok: boolean;
  reason: string;
  matched: string | null;
  result?: Record<string, unknown>;
  output: string;
};

type GatewayInput = {
  actorId: string;
  args: Record<string, unknown>;
  botId: string;
  channelId?: string;
  mcpUrl: string;
  pageUrl?: string;
  run?: RunRecord;
  store: GabotStore;
  toolName: string;
};

const ROUTINE_NOT_FOUND = 'routine not found';
const TOOL_DENIED = 'tool.denied';
const CHANNEL_REQUIRED = 'channelId is required';

export async function runGatewayAction(input: GatewayInput): Promise<GatewayResult> {
  if (input.run && !runMayInvoke(input.run.authority, input.toolName)) {
    const message = `Run ${input.run.id} is not authorized to invoke ${input.toolName}.`;
    await writeAudit(input, TOOL_DENIED, { tool: input.toolName, reason: message });
    return { ok: false, reason: message, matched: 'authority', output: message };
  }
  const policy = await input.store.getPolicy();
  const url = asString(input.args.url) || input.pageUrl || '';
  const context = policyContext(input, url);
  const decision = evaluateActionPolicy(policy, context);

  if (!decision.forward) {
    await writeAudit(input, 'policy.refused', {
      tool: input.toolName,
      reason: decision.reason,
      rule: decision.matched,
    });
    return {
      ok: false,
      reason: decision.reason,
      matched: decision.matched,
      output: decision.reason,
    };
  }

  return executeAllowed(input, decision.matched, decision.reason);
}

async function executeAllowed(
  input: GatewayInput,
  matched: string | null,
  reason: string,
): Promise<GatewayResult> {
  switch (input.toolName) {
    case MCP_ECHO: {
      return runMcp(input, matched, reason);
    }
    case COMPONENT_NOTE: {
      return runComponent(input, matched, reason);
    }
    case ASK_PERSON: {
      return runHandoff(input, matched, reason);
    }
    case CREATE_BOT: {
      return runCreateBot(input, matched, reason);
    }
    case CREATE_ROUTINE: {
      return runCreateRoutine(input, matched, reason);
    }
    case UPDATE_ROUTINE: {
      return runUpdateRoutine(input, matched, reason);
    }
    case DELEGATE_TO_BOT: {
      return runDelegate(input, matched, reason);
    }
    case GITHUB_CREATE_ISSUE: {
      return runGithubCreateIssue(input, matched, reason);
    }
    default: {
      const message = `Unknown tool ${input.toolName}`;
      return { ok: false, reason: message, matched, output: message };
    }
  }
}

async function runMcp(
  input: GatewayInput,
  matched: string | null,
  reason: string,
): Promise<GatewayResult> {
  const authorized = await authorizeCapability(input, CAPABILITY_MCP_ECHO, RESOURCE_MCP_ECHO);
  if (!authorized.ok) {
    return authorized.result;
  }
  const text = asString(input.args.text) || 'hello';
  const response = await fetch(`${input.mcpUrl.replace(/\/$/, '')}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'echo', arguments: { text } },
    }),
  });
  const body = (await response.json()) as { result?: { content?: Array<{ text?: string }> } };
  const output = body.result?.content?.[0]?.text ?? text;
  await writeAudit(input, 'mcp.called', {
    tool: 'echo',
    output,
    ...authorized.audit,
    decision: 'allow',
  });
  return { ok: true, reason, matched, output };
}

async function runComponent(
  input: GatewayInput,
  matched: string | null,
  reason: string,
): Promise<GatewayResult> {
  const authorized = await authorizeCapability(
    input,
    CAPABILITY_COMPONENT_NOTE,
    RESOURCE_COMPONENT_NOTE,
  );
  if (!authorized.ok) {
    return authorized.result;
  }
  const title = asString(input.args.title) || 'Note';
  const body = asString(input.args.body) || '';
  await writeAudit(input, 'component.rendered', {
    title,
    ...authorized.audit,
    decision: 'allow',
  });
  return { ok: true, reason, matched, output: `Note: ${title} ${body}`.trim() };
}

async function runGithubCreateIssue(
  input: GatewayInput,
  matched: string | null,
  reason: string,
): Promise<GatewayResult> {
  const repo = asString(input.args.repo);
  const title = asString(input.args.title);
  if (!repo || !title) {
    const message = 'repo and title are required';
    return { ok: false, reason: message, matched, output: message };
  }
  const authorized = await authorizeCapability(input, CAPABILITY_GITHUB_ISSUES_CREATE, repo);
  if (!authorized.ok) {
    return authorized.result;
  }
  const output = `Created issue on ${repo}: ${title}`;
  await writeAudit(input, 'github.issue.stubbed', {
    repo,
    title,
    ...authorized.audit,
    decision: 'allow',
  });
  return { ok: true, reason, matched, output };
}

async function authorizeCapability(
  input: GatewayInput,
  capability: string,
  resource: string,
): Promise<
  | { audit: { capability: string; connectionId: string; resource: string }; ok: true }
  | { ok: false; result: GatewayResult }
> {
  if (!input.run) {
    const message = 'Grant-gated tools require a Run.';
    await writeAudit(input, TOOL_DENIED, {
      capability,
      resource,
      decision: 'deny',
      reason: message,
    });
    return { ok: false, result: { ok: false, reason: message, matched: 'grant', output: message } };
  }
  const [connections, grants, policies] = await Promise.all([
    input.store.listOwnerConnections(input.run.workspaceId),
    input.store.listCapabilityGrants(input.run.workspaceId),
    input.store.listChannelPolicies(input.run.channelId),
  ]);
  const match = matchCapabilityGrant({
    workspaceId: input.run.workspaceId,
    ownerUserId: input.run.ownerUserId,
    capability,
    resource,
    connections,
    grants,
  });
  if (!match.ok) {
    await writeAudit(input, TOOL_DENIED, {
      capability,
      resource,
      decision: 'deny',
      reason: match.reason,
    });
    return {
      ok: false,
      result: { ok: false, reason: match.reason, matched: 'grant', output: match.reason },
    };
  }
  const policy = matchChannelPolicy({
    channelId: input.run.channelId,
    capability,
    resource,
    policies,
  });
  if (!policy.ok) {
    await writeAudit(input, TOOL_DENIED, {
      capability,
      resource,
      decision: 'deny',
      reason: policy.reason,
    });
    return {
      ok: false,
      result: {
        ok: false,
        reason: policy.reason,
        matched: 'channel-policy',
        output: policy.reason,
      },
    };
  }
  return {
    ok: true,
    audit: {
      connectionId: match.connection.id,
      capability,
      resource,
    },
  };
}

async function runHandoff(
  input: GatewayInput,
  matched: string | null,
  reason: string,
): Promise<GatewayResult> {
  const prompt = asString(input.args.prompt) || 'Need a person.';
  await input.store.enqueueWork({
    kind: 'handoff',
    key: `${input.botId}:${Date.now()}`,
    payload: { prompt, actorId: input.actorId, channelId: input.channelId },
  });
  await writeAudit(input, 'handoff.enqueued', { prompt });
  return { ok: true, reason, matched, output: 'Asked a person via the work queue.' };
}

async function runCreateBot(
  input: GatewayInput,
  matched: string | null,
  reason: string,
): Promise<GatewayResult> {
  const name = asString(input.args.name) || asString(input.args.title) || 'New coworker';
  const title = asString(input.args.title) || name;
  const roleDescription =
    asString(input.args.roleDescription) || 'Created by a bot in conversation.';
  const profile = await input.store.createAgent({ name, title, roleDescription });
  if (input.channelId) {
    await input.store.addChannelParticipant({
      channelId: input.channelId,
      principalType: 'bot',
      principalId: profile.id,
      role: 'bot',
    });
  }
  await writeAudit(input, 'agent.created', { agentId: profile.id, name: profile.name });
  return {
    ok: true,
    reason,
    matched,
    output: `Created bot ${profile.title} (${profile.id}).`,
  };
}

async function runCreateRoutine(
  input: GatewayInput,
  matched: string | null,
  reason: string,
): Promise<GatewayResult> {
  const instruction = asString(input.args.instruction);
  if (!instruction) {
    return {
      ok: false,
      reason: 'instruction is required',
      matched,
      output: 'instruction is required',
    };
  }
  const cron = asString(input.args.cron) || '0 * * * *';
  const timezone = asString(input.args.timezone) || 'UTC';
  const channelId = input.channelId;
  if (!channelId) {
    return {
      ok: false,
      reason: CHANNEL_REQUIRED,
      matched,
      output: CHANNEL_REQUIRED,
    };
  }
  const routine = await input.store.createRoutine({
    ownerUserId: input.actorId,
    agentId: input.botId,
    channelId,
    instruction,
    cron,
    timezone,
    nextRunAt: nextRoutineRun(cron),
  });
  await writeAudit(input, 'routine.created', { routineId: routine.id, cron });
  return {
    ok: true,
    reason,
    matched,
    output: `Scheduled ${instruction} on ${cron} (${routine.id}).`,
  };
}

async function runUpdateRoutine(
  input: GatewayInput,
  matched: string | null,
  reason: string,
): Promise<GatewayResult> {
  const idOrMatch = asString(input.args.id);
  if (!idOrMatch) {
    return { ok: false, reason: 'id is required', matched, output: 'id is required' };
  }
  const routines = await input.store.listRoutinesFor(input.actorId);
  const needle = idOrMatch.toLowerCase();
  const routine =
    routines.find((row) => row.id === idOrMatch) ??
    routines.find((row) => row.instruction.toLowerCase().includes(needle));
  if (!routine) {
    return {
      ok: false,
      reason: ROUTINE_NOT_FOUND,
      matched,
      output: `No routine matched ${idOrMatch}.`,
    };
  }
  const patch: RoutinePatch = {};
  const instruction = asString(input.args.instruction);
  if (instruction) {
    patch.instruction = instruction;
  }
  const cron = asString(input.args.cron);
  if (cron) {
    patch.cron = cron;
  }
  const timezone = asString(input.args.timezone);
  if (timezone) {
    patch.timezone = timezone;
  }
  const enabled = boolArg(input.args.enabled);
  if (enabled !== undefined) {
    patch.enabled = enabled;
  }
  if (Object.keys(patch).length === 0) {
    return {
      ok: false,
      reason: 'no fields to update',
      matched,
      output: 'Provide instruction, cron, timezone, or enabled.',
    };
  }
  const updated = await input.store.updateRoutine(routine.id, input.actorId, patch);
  if (!updated) {
    return { ok: false, reason: ROUTINE_NOT_FOUND, matched, output: ROUTINE_NOT_FOUND };
  }
  await writeAudit(input, 'routine.updated', {
    routineId: updated.id,
    instruction: updated.instruction,
    cron: updated.cron,
  });
  return {
    ok: true,
    reason,
    matched,
    output: `Updated routine to ${updated.instruction} on ${updated.cron} (${updated.id}).`,
  };
}

async function runDelegate(
  input: GatewayInput,
  matched: string | null,
  reason: string,
): Promise<GatewayResult> {
  const parent = input.run;
  const channelId = input.channelId;
  const toBotId = asString(input.args.botId);
  const objective = asString(input.args.objective);
  if (!parent || !channelId) {
    const message = 'Delegation requires a durable run and channel.';
    return { ok: false, reason: message, matched, output: message };
  }
  if (!toBotId || !objective) {
    const message = 'botId and objective are required.';
    return { ok: false, reason: message, matched, output: message };
  }
  const participating = await input.store.isChannelParticipant(channelId, 'bot', toBotId);
  if (!participating) {
    const message = `${toBotId} is not a participant in this channel.`;
    await writeAudit(input, TOOL_DENIED, { tool: DELEGATE_TO_BOT, reason: message });
    return { ok: false, reason: message, matched: 'participant', output: message };
  }
  const requested = capabilityArgs(input.args.requestedCapabilities);
  const attenuated = attenuateAuthority(parent.authority, requested);
  if (!attenuated.ok) {
    await writeAudit(input, TOOL_DENIED, { tool: DELEGATE_TO_BOT, reason: attenuated.reason });
    return {
      ok: false,
      reason: attenuated.reason,
      matched: 'authority',
      output: attenuated.reason,
    };
  }
  try {
    const child = await input.store.createDelegatedChild({
      parent,
      toBotId,
      objective,
      requestedCapabilities: requested,
      authority: attenuated.envelope,
    });
    await writeAudit(input, 'run.delegated', {
      childRunId: child.id,
      toBotId,
      parentRunId: parent.id,
    });
    return {
      ok: true,
      reason,
      matched,
      output: `Delegated to @${toBotId}.`,
    };
  } catch (error) {
    if (error instanceof DelegationBudgetError) {
      await writeAudit(input, TOOL_DENIED, { tool: DELEGATE_TO_BOT, reason: error.message });
      return { ok: false, reason: error.message, matched: 'budget', output: error.message };
    }
    throw error;
  }
}

async function writeAudit(
  input: GatewayInput,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await input.store.insertAudit({
    actorUserId: input.actorId,
    eventType,
    targetType: 'bot',
    targetId: input.botId,
    payload: {
      ...payload,
      tool: input.toolName,
      workspaceId: input.run?.workspaceId,
      ownerUserId: input.run?.ownerUserId ?? input.actorId,
      botId: input.botId,
      runId: input.run?.id,
    },
  });
}

function capabilityArgs(value: unknown): string[] {
  if (typeof value === 'string' && value.length > 0) {
    return asStringArray(value.split(',').map((item) => item.trim()));
  }
  return asStringArray(value);
}

function boolArg(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return undefined;
}

function policyContext(input: GatewayInput, url: string): PolicyContext {
  const host = pageHost(url);
  const mcp =
    input.toolName === MCP_ECHO
      ? { server: 'mock', tool: 'echo', effect: 'write' as const }
      : undefined;
  return {
    tool: { name: input.toolName },
    bot: { id: input.botId },
    page: { url, host },
    actor: { id: input.actorId },
    intent: 'write_tool',
    mcp,
  };
}
