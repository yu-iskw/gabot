import { randomUUID } from 'node:crypto';

import { HttpAgent } from '@ag-ui/client';
import {
  botIdentityContent,
  buildDelegateToBotTool,
  collectAguiObservable,
  collectText,
  collectToolCalls,
  configuredModelStepsPerRun,
  decideScriptedTurn,
  DELEGATE_TO_BOT,
  membershipCoversWorkspace,
  mentionedBotId,
  rootAuthority,
  runModelAsAgui,
  toRunAgentInput,
  TURN_TOOL_NAMES,
  TURN_TOOLS,
} from '@gabot/common';

import type { IdentityTeammate } from '@gabot/common';

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
  const http = new HttpAgent({ url: `${root}/ag-ui` });
  return {
    async run(input) {
      return collectAguiObservable(http.run(toRunAgentInput(input)));
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

type HeldTurn = TurnDeps & { executorId: string };

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

type TurnOutcome = 'busy' | 'executed' | 'lost' | 'terminal';

export type TurnResult = {
  outcome: TurnOutcome;
  runId: string;
  text: string;
  toolNames: string[];
};

type OfferedTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

async function channelBotRoster(
  store: GabotStore,
  channelId: string,
): Promise<{ botIds: string[]; teammates: IdentityTeammate[] }> {
  const participants = await store.listChannelParticipants(channelId);
  const botIds = participants
    .filter((row) => row.principalType === 'bot')
    .map((row) => row.principalId);
  const agents = await store.listAgents();
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  const teammates: IdentityTeammate[] = botIds.map((id) => {
    const agent = byId.get(id);
    return {
      id,
      title: agent?.title ?? agent?.name,
      roleDescription: agent?.roleDescription,
    };
  });
  return { botIds, teammates };
}

function offeredToolsForRoster(botIds: readonly string[]): OfferedTool[] {
  const delegate = buildDelegateToBotTool(botIds);
  return TURN_TOOLS.map((tool) => {
    if (tool.name === DELEGATE_TO_BOT) {
      return {
        name: delegate.name,
        description: delegate.description,
        parameters: { ...delegate.parameters },
      };
    }
    return {
      name: tool.name,
      description: tool.description,
      parameters: { ...tool.parameters },
    };
  });
}

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
  const [scope, participating, membership] = await Promise.all([
    input.store.getChannelScope(input.channelId),
    input.store.isChannelParticipant(input.channelId, 'bot', botId),
    input.store.getMembership(input.user.id),
  ]);
  if (!scope) {
    throw new TurnClientError(`Channel ${input.channelId} is not in a workspace project.`);
  }
  if (!participating) {
    throw new TurnClientError(`Bot ${botId} is not a participant on channel ${input.channelId}.`);
  }
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
  const held: HeldTurn = { ...input, executorId: input.executorId ?? processExecutorId() };
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
  const acquired = await input.store.acquireRun({ runId: preview.id, executorId: held.executorId });
  if (acquired.outcome === 'missing') {
    throw new Error(`Run ${input.runId} not found.`);
  }
  if (acquired.outcome !== 'started') {
    return { outcome: acquired.outcome, runId: preview.id, text: '', toolNames: [] };
  }
  return runToCompletion(held, acquired.run);
}

async function runToCompletion(input: HeldTurn, run: RunRecord): Promise<TurnResult> {
  try {
    return await completeRun(input, run);
  } catch (error) {
    if (isRunFenced(error)) {
      throw error;
    }
    await settleFailedRun(input, run, error);
    throw error;
  }
}

async function settleFailedRun(input: HeldTurn, run: RunRecord, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : 'run failed';
  const settled = await input.store.settleRun({
    runId: run.id,
    executorId: input.executorId,
    status: 'failed',
    error: message,
  });
  if (!settled) {
    return;
  }
  await recordRunEvent(input.store, {
    run,
    type: run.parentRunId ? 'agent.delegation.failed' : 'run.failed',
    actorType: 'bot',
    actorId: run.botId,
    payload: { error: message },
  });
}

async function completeRun(input: HeldTurn, run: RunRecord): Promise<TurnResult> {
  const roster = await channelBotRoster(input.store, run.channelId);
  const tools = offeredToolsForRoster(roster.botIds);
  const [threadId, seeded] = await Promise.all([
    input.store.mintThread(run.ownerUserId, run.channelId),
    messagesForRun(input.store, run, roster.teammates),
  ]);
  const toolNames: string[] = [];
  let text = '';
  let current = seeded;
  for (let step = 0; step < configuredModelStepsPerRun(); step += 1) {
    await assertHeld(input, run);
    const events = await input.agent.run({
      threadId,
      runId: run.id,
      messages: current,
      tools,
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
    current = await applyToolCalls({ input, run, messages: current, calls, toolNames });
  }
  const settled = await input.store.settleRun({
    runId: run.id,
    executorId: input.executorId,
    status: 'succeeded',
    assistantContent: text || undefined,
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

async function assertHeld(input: HeldTurn, run: RunRecord): Promise<void> {
  const lease = await input.store.renewRunLease({ runId: run.id, executorId: input.executorId });
  if (!lease) {
    throw new RunFencedError(run.id);
  }
}

async function messagesForRun(
  store: GabotStore,
  run: RunRecord,
  teammates: readonly IdentityTeammate[],
): Promise<AguiRunInput['messages']> {
  const identity = {
    role: 'system' as const,
    content: botIdentityContent(run.botId, teammates),
  };
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
  input: HeldTurn;
  messages: AguiRunInput['messages'];
  run: RunRecord;
  toolNames: string[];
}): Promise<AguiRunInput['messages']> {
  const { input, run, messages, calls, toolNames } = options;
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
    await assertHeld(input, run);
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
