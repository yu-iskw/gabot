import { randomUUID } from 'node:crypto';

import {
  botIdentityContent,
  collectText,
  collectToolCalls,
  decideScriptedTurn,
  membershipCoversWorkspace,
  mentionedBotId,
  parseAguiSse,
  rootAuthority,
  runModelAsAgui,
  TURN_TOOL_NAMES,
  TURN_TOOLS,
} from '@gabot/common';

import { runGatewayAction } from './gateway.js';
import { PROTECTED_AGENT_ID } from './store/types.js';

import type { GabotStore, RunRecord, RunTriggerType, SessionUser } from './store/types.js';
import type { AguiRunInput, AguiToolCall, ModelPort } from '@gabot/common';

let cachedExecutorId: string | undefined;

export function processExecutorId(): string {
  cachedExecutorId ??= `api-${randomUUID()}`;
  return cachedExecutorId;
}

export class RunFencedError extends Error {
  public constructor(runId: string) {
    super(`Run ${runId} is no longer owned by this executor.`);
    this.name = 'RunFencedError';
  }
}

export function isRunFenced(error: unknown): error is RunFencedError {
  return error instanceof RunFencedError;
}

type AgentRunInput = AguiRunInput & { botId?: string };

export type AgentRunner = {
  run(input: AgentRunInput): Promise<AguiEventList>;
};

type AguiEventList = Awaited<ReturnType<typeof runModelAsAgui>>;

export function createScriptedAgentRunner(): AgentRunner {
  return {
    run: async (input) => {
      const model: ModelPort = {
        complete: ({ messages }) => Promise.resolve(decideScriptedTurn(messages, input.botId)),
      };
      return runModelAsAgui(model, input);
    },
  };
}

export function createHttpAgentRunner(agentUrl: string): AgentRunner {
  const root = agentUrl.replace(/\/$/, '');
  return {
    async run(input) {
      const response = await fetch(`${root}/ag-ui`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        throw new Error(`Agent HTTP ${String(response.status)}`);
      }
      return parseAguiSse(await response.text());
    },
  };
}

type TurnDeps = {
  agent: AgentRunner;
  executorId?: string;
  mcpUrl: string;
  store: GabotStore;
  user: SessionUser;
};

type TurnInput = TurnDeps & {
  botId?: string;
  channelId: string;
  message: string;
  triggerType: Exclude<RunTriggerType, 'delegation'>;
};

type ExecuteRunInput = TurnDeps & {
  run?: RunRecord;
  runId: string;
};

export type TurnOutcome = 'busy' | 'executed' | 'lost' | 'terminal';

export type TurnResult = {
  outcome: TurnOutcome;
  runId: string;
  text: string;
  toolNames: string[];
};

const OFFERED_TOOLS = TURN_TOOLS.map((tool) => ({
  name: tool.name,
  description: tool.description,
  parameters: { ...tool.parameters },
}));

class TurnClientError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'TurnClientError';
  }
}

export function isTurnClientError(error: unknown): boolean {
  return error instanceof TurnClientError;
}

async function defaultParticipantBotId(store: GabotStore, channelId: string): Promise<string> {
  const bots = (await store.listChannelParticipants(channelId))
    .filter((row) => row.principalType === 'bot')
    .map((row) => row.principalId);
  if (bots.includes(PROTECTED_AGENT_ID)) {
    return PROTECTED_AGENT_ID;
  }
  const fallback = bots[0];
  if (!fallback) {
    throw new TurnClientError(`No bot is a participant on channel ${channelId}.`);
  }
  return fallback;
}

export async function executeTurn(input: TurnInput): Promise<TurnResult> {
  const botId =
    input.botId ??
    mentionedBotId(input.message) ??
    (await defaultParticipantBotId(input.store, input.channelId));
  const [scope, participating] = await Promise.all([
    input.store.getChannelScope(input.channelId),
    input.store.isChannelParticipant(input.channelId, 'bot', botId),
  ]);
  if (!scope) {
    throw new TurnClientError(`Channel ${input.channelId} is not in a workspace project.`);
  }
  if (!participating) {
    throw new TurnClientError(`Bot ${botId} is not a participant on channel ${input.channelId}.`);
  }
  const membership = await input.store.getMembership(input.user.id);
  if (!membershipCoversWorkspace(membership, scope.workspaceId)) {
    throw new TurnClientError(
      'Active workspace membership is required to start a run on this channel.',
    );
  }
  const executorId = input.executorId ?? processExecutorId();
  const admitted = await input.store.admitRootRun({
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    channelId: input.channelId,
    botId,
    ownerUserId: input.user.id,
    triggerType: input.triggerType,
    message: input.message,
    authority: rootAuthority(TURN_TOOL_NAMES),
    executorId,
  });
  return executeRun({
    store: input.store,
    agent: input.agent,
    mcpUrl: input.mcpUrl,
    user: input.user,
    executorId,
    run: admitted.run,
    runId: admitted.run.id,
  });
}

const TERMINAL_RUN_STATUSES = new Set<RunRecord['status']>(['succeeded', 'cancelled', 'failed']);

export async function executeRun(input: ExecuteRunInput): Promise<TurnResult> {
  const executorId = input.executorId ?? processExecutorId();
  const preview = input.run ?? (await input.store.getRun(input.runId));
  if (!preview) {
    throw new Error(`Run ${input.runId} not found.`);
  }
  if (TERMINAL_RUN_STATUSES.has(preview.status)) {
    return { outcome: 'terminal', runId: preview.id, text: '', toolNames: [] };
  }
  const membership = await input.store.getMembership(input.user.id);
  if (!membershipCoversWorkspace(membership, preview.workspaceId)) {
    throw new TurnClientError('Active workspace membership is required to execute this run.');
  }
  const acquired = await input.store.acquireRun({ runId: preview.id, executorId });
  if (acquired.outcome === 'missing') {
    throw new Error(`Run ${input.runId} not found.`);
  }
  if (acquired.outcome !== 'started') {
    return { outcome: acquired.outcome, runId: preview.id, text: '', toolNames: [] };
  }
  return runToCompletion(input, acquired.run, executorId);
}

async function runToCompletion(
  input: TurnDeps,
  run: RunRecord,
  executorId: string,
): Promise<TurnResult> {
  try {
    return await completeRun(input, run, executorId);
  } catch (error) {
    if (isRunFenced(error)) {
      throw error;
    }
    await settleFailedRun(input.store, run, executorId, error);
    throw error;
  }
}

async function settleFailedRun(
  store: GabotStore,
  run: RunRecord,
  executorId: string,
  error: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.message : 'run failed';
  const settled = await store.settleRun({
    runId: run.id,
    executorId,
    status: 'failed',
    error: message,
  });
  if (!settled) {
    return;
  }
  await recordRunEvent(store, {
    run,
    type: run.parentRunId ? 'agent.delegation.failed' : 'run.failed',
    actorType: 'bot',
    actorId: run.botId,
    payload: { error: message },
  });
}

async function completeRun(
  input: TurnDeps,
  run: RunRecord,
  executorId: string,
): Promise<TurnResult> {
  const [threadId, seeded] = await Promise.all([
    input.store.mintThread(run.ownerUserId, run.channelId),
    messagesForRun(input.store, run),
  ]);
  const toolNames: string[] = [];
  let text = '';
  let current = seeded;
  for (let step = 0; step < 4; step += 1) {
    await assertHeld(input.store, run, executorId);
    const events = await input.agent.run({
      threadId,
      runId: run.id,
      messages: current,
      tools: OFFERED_TOOLS,
      botId: run.botId,
    });
    const calls = collectToolCalls(events);
    const chunk = collectText(events);
    if (chunk) {
      text = chunk;
    }
    if (calls.length === 0) {
      break;
    }
    current = await applyToolCalls({ input, run, messages: current, calls, toolNames, executorId });
  }
  if (text) {
    await input.store.appendMessage({
      channelId: run.channelId,
      role: 'assistant',
      content: text,
      agentId: run.botId,
    });
  }
  const settled = await input.store.settleRun({
    runId: run.id,
    executorId,
    status: 'succeeded',
  });
  if (!settled) {
    throw new RunFencedError(run.id);
  }
  await recordRunEvent(input.store, {
    run,
    type: 'run.succeeded',
    actorType: 'bot',
    actorId: run.botId,
  });
  if (run.parentRunId) {
    await recordRunEvent(input.store, {
      run,
      type: 'agent.delegation.completed',
      actorType: 'bot',
      actorId: run.botId,
      payload: { parentRunId: run.parentRunId },
    });
  }
  return { outcome: 'executed', runId: run.id, text, toolNames };
}

async function assertHeld(store: GabotStore, run: RunRecord, executorId: string): Promise<void> {
  const lease = await store.renewRunLease({ runId: run.id, executorId });
  if (!lease) {
    throw new RunFencedError(run.id);
  }
}

async function messagesForRun(
  store: GabotStore,
  run: RunRecord,
): Promise<AguiRunInput['messages']> {
  const identity = { role: 'system' as const, content: botIdentityContent(run.botId) };
  if (run.parentRunId) {
    return [identity, { role: 'user', content: run.objective }];
  }
  const history = await store.listMessages(run.channelId);
  return [
    identity,
    ...history.map((row) => ({
      role: roleOf(row.role),
      content: row.content,
    })),
  ];
}

async function applyToolCalls(options: {
  calls: AguiToolCall[];
  executorId: string;
  input: TurnDeps;
  messages: AguiRunInput['messages'];
  run: RunRecord;
  toolNames: string[];
}): Promise<AguiRunInput['messages']> {
  const { input, run, messages, calls, toolNames, executorId } = options;
  let next = [...messages];
  for (const call of calls) {
    toolNames.push(call.name);
    await recordRunEvent(input.store, {
      run,
      type: 'tool.requested',
      actorType: 'bot',
      actorId: run.botId,
      payload: { tool: call.name },
    });
    await assertHeld(input.store, run, executorId);
    const result = await runGatewayAction({
      store: input.store,
      mcpUrl: input.mcpUrl,
      actorId: input.user.id,
      botId: run.botId,
      toolName: call.name,
      args: call.arguments,
      channelId: run.channelId,
      run,
    });
    await recordRunEvent(input.store, {
      run,
      type: result.ok ? 'tool.completed' : 'tool.denied',
      actorType: 'bot',
      actorId: run.botId,
      payload: { tool: call.name, output: result.output },
    });
    next = [
      ...next,
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: call.id, name: call.name, arguments: call.arguments }],
      },
      { role: 'tool', content: result.output, toolCallId: call.id, toolName: call.name },
    ];
    await input.store.appendMessage({
      channelId: run.channelId,
      role: 'tool',
      content: result.output,
      agentId: run.botId,
    });
  }
  return next;
}

function recordRunEvent(
  store: GabotStore,
  event: {
    actorId: string;
    actorType: string;
    payload?: Record<string, unknown>;
    run: Pick<RunRecord, 'channelId' | 'id'>;
    type: string;
  },
): Promise<unknown> {
  return store.appendChannelEvent({
    channelId: event.run.channelId,
    runId: event.run.id,
    type: event.type,
    actorType: event.actorType,
    actorId: event.actorId,
    payload: event.payload,
  });
}

function roleOf(role: string): 'user' | 'assistant' | 'tool' | 'system' {
  if (role === 'assistant' || role === 'tool' || role === 'system') {
    return role;
  }
  return 'user';
}
