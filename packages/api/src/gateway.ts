import {
  ASK_PERSON,
  COMPONENT_NOTE,
  COMPUTER_NAVIGATE,
  COMPUTER_SCREENSHOT,
  CREATE_BOT,
  CREATE_ROUTINE,
  evaluateActionPolicy,
  MCP_ECHO,
  nextRoutineRun,
  pageHost,
  UPDATE_ROUTINE,
} from '@gabot/common';

import type { GabotStore, RoutinePatch } from './store/types.js';
import type { ComputerActionResult, PolicyContext, SandboxPort } from '@gabot/common';

type GatewayResult = {
  ok: boolean;
  reason: string;
  matched: string | null;
  result?: ComputerActionResult;
  output: string;
};

type GatewayInput = {
  store: GabotStore;
  sandbox: SandboxPort;
  mcpUrl: string;
  actorId: string;
  botId: string;
  toolName: string;
  args: Record<string, unknown>;
  pageUrl?: string;
  channelId?: string;
};

const ROUTINE_NOT_FOUND = 'routine not found';

export async function runGatewayAction(input: GatewayInput): Promise<GatewayResult> {
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
    payload: { prompt, actorId: input.actorId, channelId: input.channelId ?? 'general' },
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
  const channelId = stringArg(input.args.channelId) || input.channelId || 'general';
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
    payload: { ...payload, tool: input.toolName },
  });
}

function stringArg(value: unknown): string {
  return typeof value === 'string' ? value : '';
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
