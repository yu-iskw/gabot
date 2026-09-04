import {
  ASK_PERSON,
  asStringArray,
  assertDelegationBudget,
  attenuateAuthority,
  COMPONENT_NOTE,
  COMPUTER_NAVIGATE,
  COMPUTER_SCREENSHOT,
  CREATE_BOT,
  CREATE_ROUTINE,
  DELEGATE_TO_BOT,
  evaluateActionPolicy,
  MCP_ECHO,
  nextRoutineRun,
  pageHost,
  runMayInvoke,
  UPDATE_ROUTINE,
} from '@gabot/common';

import type { GabotStore, RoutinePatch, RunRecord } from './store/types.js';
import type { ComputerActionResult, PolicyContext, SandboxPort } from '@gabot/common';

type GatewayResult = {
  ok: boolean;
  reason: string;
  matched: string | null;
  result?: ComputerActionResult;
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
  sandbox: SandboxPort;
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
  const url = stringArg(input.args.url) || input.pageUrl || '';
  const context = policyContext(input, url);
  const decision = evaluateActionPolicy(policy, context);

  if (!decision.forward) {
    await writeAudit(input, 'computer.refused', {
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
    case COMPUTER_NAVIGATE: {
      return runNavigate(input, matched, reason);
    }
    case COMPUTER_SCREENSHOT: {
      return runScreenshot(input, matched, reason);
    }
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
    default: {
      const message = `Unknown tool ${input.toolName}`;
      return { ok: false, reason: message, matched, output: message };
    }
  }
}

async function runNavigate(
  input: GatewayInput,
  matched: string | null,
  reason: string,
): Promise<GatewayResult> {
  const url = stringArg(input.args.url);
  if (!url) {
    return { ok: false, reason: 'url is required', matched, output: 'url is required' };
  }
  const result = await input.sandbox.navigate(input.botId, url);
  await writeAudit(input, 'computer.navigate', { url, ok: result.ok });
  const output = result.ok ? `Opened ${result.url ?? url}` : (result.error ?? 'navigate failed');
  return { ok: result.ok, reason, matched, result, output };
}

async function runScreenshot(
  input: GatewayInput,
  matched: string | null,
  reason: string,
): Promise<GatewayResult> {
  const result = await input.sandbox.screenshot(input.botId);
  return {
    ok: result.ok,
    reason,
    matched,
    result,
    output: result.ok ? 'screenshot' : (result.error ?? 'failed'),
  };
}

async function runMcp(
  input: GatewayInput,
  matched: string | null,
  reason: string,
): Promise<GatewayResult> {
  const granted = await input.store.hasGrant(input.botId, 'mcp', 'mock/echo');
  if (!granted) {
    const message = 'MCP tool echo on mock is not granted.';
    await writeAudit(input, 'mcp.refused', { tool: 'echo', server: 'mock', reason: message });
    return { ok: false, reason: message, matched: 'grant', output: message };
  }
  const text = stringArg(input.args.text) || 'hello';
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
  await writeAudit(input, 'mcp.called', { tool: 'echo', output });
  return { ok: true, reason, matched, output };
}

async function runComponent(
  input: GatewayInput,
  matched: string | null,
  reason: string,
): Promise<GatewayResult> {
  const granted = await input.store.hasGrant(input.botId, 'component', COMPONENT_NOTE);
  if (!granted) {
    const message = 'Component component_note is not granted.';
    await writeAudit(input, 'component.refused', { tool: COMPONENT_NOTE });
    return { ok: false, reason: message, matched: 'grant', output: message };
  }
  const title = stringArg(input.args.title) || 'Note';
  const body = stringArg(input.args.body) || '';
  await writeAudit(input, 'component.rendered', { title });
  return { ok: true, reason, matched, output: `Note: ${title} ${body}`.trim() };
}

async function runHandoff(
  input: GatewayInput,
  matched: string | null,
  reason: string,
): Promise<GatewayResult> {
  const prompt = stringArg(input.args.prompt) || 'Need a person.';
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
  const name = stringArg(input.args.name) || stringArg(input.args.title) || 'New coworker';
  const title = stringArg(input.args.title) || name;
  const roleDescription =
    stringArg(input.args.roleDescription) || 'Created by a bot in conversation.';
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
  const instruction = stringArg(input.args.instruction);
  if (!instruction) {
    return {
      ok: false,
      reason: 'instruction is required',
      matched,
      output: 'instruction is required',
    };
  }
  const cron = stringArg(input.args.cron) || '0 * * * *';
  const timezone = stringArg(input.args.timezone) || 'UTC';
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
  const idOrMatch = stringArg(input.args.id);
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
  const instruction = stringArg(input.args.instruction);
  if (instruction) {
    patch.instruction = instruction;
  }
  const cron = stringArg(input.args.cron);
  if (cron) {
    patch.cron = cron;
  }
  const timezone = stringArg(input.args.timezone);
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
  const toBotId = stringArg(input.args.botId);
  const objective = stringArg(input.args.objective);
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
  const [childCount, rootRunCount] = await Promise.all([
    input.store.countChildRuns(parent.id),
    input.store.countRunsForRoot(parent.rootRunId),
  ]);
  const budget = assertDelegationBudget({
    depth: parent.depth,
    childCount,
    rootRunCount,
  });
  if (!budget.ok) {
    await writeAudit(input, TOOL_DENIED, { tool: DELEGATE_TO_BOT, reason: budget.reason });
    return { ok: false, reason: budget.reason, matched: 'budget', output: budget.reason };
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
  const child = await input.store.createRun({
    workspaceId: parent.workspaceId,
    projectId: parent.projectId,
    channelId,
    parentRunId: parent.id,
    rootRunId: parent.rootRunId,
    botId: toBotId,
    ownerUserId: parent.ownerUserId,
    triggerType: 'delegation',
    status: 'queued',
    objective,
    authority: attenuated.envelope,
    depth: parent.depth + 1,
  });
  await input.store.createDelegation({
    parentRunId: parent.id,
    childRunId: child.id,
    fromBotId: parent.botId,
    toBotId,
    objective,
    requestedCapabilities: requested,
    authorityEnvelope: attenuated.envelope,
  });
  await input.store.enqueueWork({
    kind: 'run.execute',
    key: child.id,
    payload: { runId: child.id },
  });
  await input.store.appendChannelEvent({
    channelId,
    runId: child.id,
    type: 'agent.delegation.requested',
    actorType: 'bot',
    actorId: parent.botId,
    payload: { toBotId, objective, parentRunId: parent.id },
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
}

async function writeAudit(
  input: GatewayInput,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await input.store.insertAudit({
    actorUserId: input.actorId,
    eventType,
    targetType: 'computer',
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

function stringArg(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function capabilityArgs(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === 'string');
  }
  if (typeof value === 'string' && value.length > 0) {
    return asStringArray(value.split(',').map((item) => item.trim()));
  }
  return [];
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
    intent: input.toolName === COMPUTER_NAVIGATE ? 'navigate' : 'write_tool',
    mcp,
  };
}
